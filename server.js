'use strict';
const http = require('http');
const url = require('url');
const fs = require('fs');
const ws = require('ws');
const { Client } = require('pg');
const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');
const querystring = require('querystring');
const Cookies = require('cookies');

const cookieKeys = ['h0oYxQ8OELU5vNSN2XZHvQr'];
const wss = new ws.Server({ port: 8080 });
const wssreg = new ws.Server({ port: 8079});

const linkRegex = new RegExp(String.raw`[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)$`);
const base64Regex = new RegExp(String.raw`^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$`);
const emailRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const dbclient = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'chatdb',
  password: 'root',
  port: 5432
}); dbclient.connect();

process.stdin.resume();

const VERBOSE_DEBUG = true;

var toSend = {};
wssreg.on('connection', (ws,req) => {
  var ip = req.connection.remoteAddress;
  toSend[ip] = ws;
  ws.on('message', function(message) {
    message = message.toString();
    if (message.split("^").length == 3) { //Register account
      ws.send('Registering account...');
      RegisterUser(message.split("^")[1],message.split("^")[0],message.split("^")[2],req.connection.remoteAddress);
    }
    else if (message.split("^").length == 2) { //deprecated, uses POST instead.
      ws.send('Logging in...');
      //LoginUser(message.split("^")[0],message.split("^")[1],req.connection.remoteAddress);
    }
  });
})

wss.on('connection', (ws,req) => {
  ws.on('message', function(message) { //Message classification
    message = message.toString();
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (VERBOSE_DEBUG) console.log(`Received message from ${ip} => ${message.substring(0,100)}`);

    if (message.substring(0,11) == "^connected^") { //first time connection
      GetMessages(message,ip,ws);
    }
    else if (CountLetter('^',message) == 4 && base64Regex.test(message.split('^')[0])) { //if file
      FileMessage(message,ip);
    }
    else if (CountLetter('^',message) == 2 && message.split('^')[1].trim().length > 0){ //normal message
      NormalMessage(message,ip);
    }
  });
})

var sessions = {};
http.createServer(function (req, res) {
  var request = req.url;
  var method = req.method;
  var cookie = new Cookies(req, res, { keys: cookieKeys });
  if (VERBOSE_DEBUG) console.log("Request from " + req.connection.remoteAddress + ": " + request);

  if("POST" == method) { //User login
    if (request == "/loginUser") {
      var postData = '';
      req.on('data', function (chunk) { postData += chunk;});
      req.on('end', function () {
        var params = querystring.parse(postData);
        LoginUser(params['user'],params['pass'],req.connection.remoteAddress,function(err, sessionID) {
          if (err) {
            res.writeHead(301,{Location: "/login"});
            res.end();
            setTimeout(function () {toSend[req.connection.remoteAddress].send(err);},1000);
            return;
          }
          //Set and store session cookie, redirect to main page.
          cookie.set('session',sessionID, { signed: true, httpOnly: false });

          res.writeHead(301,{Location: "/"});
          res.end();
        });
      })
      return;
    }
  }

  if (request == "/") request = "/index"; //get index if nothing requested
  if (request.indexOf("userfiles") == -1) request = "src/" + request;
  if (request.split(".").length < 2) request += ".html"; //assume file is html
  if (request.split("?").length > 1) request = request.split("?")[0]; //remove GET params
  console.log(request);
  fs.readFile(request.replace("/",""),function(err,data) { //search for requested file
    if (err) {
      res.writeHead(404,{'Content-Type': 'text/html'});
      res.end("404 Not Found");
      return;
    }

    if (request.substring(request.length - 2) == "js")
      res.writeHead(200, {'Content-Type': 'application/javascript'});
    else if (request.substring(request.length - 3) == "css")
      res.writeHead(200, {'Content-Type': 'text/css'});
    else
      res.writeHead(200, {'Content-Type': 'text/html'});

    res.write(data);
    res.end();
    return;
  });
}).listen(8081);

function GetMessages(message,ip,ws) {
  var name = sessions[message.split('^')[2]];
  if (!name) name = "Guest@" + crypto.createHash('sha1').update(ip).digest('hex').substring(0,5);
  ws.send('<b>SERVER: Connected to room ' + message.split('^')[3] + ' as ' + name + '</b>');
  dbclient.query('SELECT * FROM messages WHERE room=$1 ORDER BY date ASC', [message.split('^')[3]] , (err, res) => {
    for(var x = 0; x < res.rowCount;x++) {
      if (!res.rows[x].file)
        SendMessage(ws,res.rows[x].msg,res.rows[x].usr + ": ");
      else if (['.jpg','.png','.gif','.bmp'].includes(res.rows[x].file.substring(res.rows[x].file.length - 4) ))
        SendMessage(ws,res.rows[x].file,res.rows[x].usr + ": ",'image');
      else
        SendMessage(ws,res.rows[x].file,res.rows[x].usr + ": ",'file');
    }
    if (err) console.log(err);
  });
}

function FileMessage(message, ip) {
  if (message.split('^')[0].length > 6291456) return; //over 6MB, not 4MB to account for base64 size increase.
  if (VERBOSE_DEBUG) console.log("Saving file.");

  if (! (message.split('^')[1] in sessions)) {
    if (VERBOSE_DEBUG) console.log('Failed file upload: not logged in.');
    return;
  }

  var pathname = SaveStringAsFile(message.split('^')[0],message.split('^')[2]);
  var query = 'INSERT INTO messages(msg,usr,room,date,ip,file) VALUES($1,$2,$3,NOW(),$4,$5)';
  var data = [' ',sessions[message.split('^')[1]],'default',ip,pathname];

  dbclient.query(query,data, (err, res) => { if (err) console.log(err); });
  if (['jpg','png','gif','bmp'].includes(message.split('^')[2].split('\.')[message.split('^')[2].split('\.').length - 1]))
    Broadcast(pathname,sessions[message.split('^')[1]] + ": ",'image');
  else
    Broadcast(pathname,sessions[message.split('^')[1]] + ": ",'file');
}

function NormalMessage(message, ip) {
  var cleanmsg = sanitizeHtml(message.split('^')[0], { allowedTags: [], allowedAttributes: {} });
  var name = sessions[message.split('^')[1]];
  if (!name) name = "Guest@" + crypto.createHash('sha1').update(ip).digest('hex').substring(0,5);;
  var query = 'INSERT INTO messages(msg,usr,room,date,ip) VALUES($1,$2,$3,NOW(),$4)';
  var data = [cleanmsg.substr(0,300),name,message.split('^')[2],ip];

  dbclient.query(query,data, (err, res) => { if (err) console.log(err); });
  Broadcast(name + ": " + cleanmsg);
}

function RegisterUser(email, user, passw,ip) {
  if (!email || !user || !passw) {
    toSend[ip].send("Make sure all the fields are filled.");
    return;
  }

  if (email.length > 256 || user.length > 64) {
    toSend[ip].send("Username or email is too long.");
    return;
  }

  if(!emailRegex.test(email.toLowerCase())) {
    toSend[ip].send("Email invalid.");
    return;
  }

  var passSalt = RandomString(8);
  var passPepper = RandomString(8);

  var finalPass = crypto.createHash('sha512').update(passSalt + passw + passPepper).digest('hex');
  var query = 'INSERT INTO users(username,password,email,created,salt,pepper) VALUES($1,$2,$3,NOW(),$4,$5)';
  var data = [user,finalPass,email,passSalt,passPepper];

  dbclient.query(query,data, (err, res) => {
    if (err) {
       toSend[ip].send("Account already exists.");
       console.log("DB ERROR: \n" + err);
    }
    else toSend[ip].send("Account created!");
  });
}

function LoginUser (user,passw,ip,callback) {
  if (!user || !passw) {
    callback("Make sure all the fields are filled.",'','');
    return;
  }

  if (user.length > 256) {
    callback("Username or email is too long.",'','');
    return;
  }

  var query;
  var data = [user];
  if(emailRegex.test(user.toLowerCase())) query = 'SELECT * FROM users WHERE email = $1';
  else query = 'SELECT * FROM users WHERE username = $1';

  dbclient.query(query,data, (err, res) => {
    if (err || res.rows.length == 0) {
      if (err) console.log("DB ERROR: \n" + err);
      callback("User not found, check email/username.",'','');
      return;
    }

    var passSalt = res.rows[0].salt;
    var passPepper = res.rows[0].pepper;
    var finalPass = crypto.createHash('sha512').update(passSalt + passw + passPepper).digest('hex');
    if (finalPass == res.rows[0].password) {
      var sessionID = RandomString(64).replace('^','a');
      for (var i in sessions) { //clearing old login sessions
        if (sessions[i] == res.rows[0].username)
          delete sessions[i];
      }
      sessions[sessionID] = res.rows[0].username;

      if (VERBOSE_DEBUG) console.log("User " + user + " logged in.");
      callback("",sessionID,res.rows[0].username);
    }
    else {
      callback("Wrong password.",'','');
    }
  });
}

function SaveStringAsFile(str,filext) {
  var sha1 = crypto.createHash('sha1').update(str).digest('hex');
  var path = 'userfiles/' + sha1 + '.' + filext;

  if (!fs.existsSync('userfiles/')) fs.mkdirSync('userfiles');

  fs.writeFile(path, str, 'base64', function(err) {
    if (VERBOSE_DEBUG) console.log('File saved.');
  });
  return path;
}

function SendMessage(websock, datastr,usrname = '', type = '') {
  var finaldatastr = datastr;

  if (type == 'file') //file dl link
    finaldatastr =  '<a href="' + datastr + '" download>Uploaded File.</a>';
  else if (type == 'image') //embedded image
    finaldatastr = '<br><img src="' + datastr + '" alt="User Image">';
  else if (datastr.includes('youtube.com/watch?v=')) //youtube link iframe
    finaldatastr = '<a href="' + datastr + '" >' + datastr + '</a><br><iframe width="450" height="253" src="https://www.youtube.com/embed/' + datastr.substr(datastr.indexOf("youtube.com/watch?v=") + "youtube.com/watch?v=".length) + '" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>;';
  else if (linkRegex.test(datastr) && ['.jpg','.png','.gif','.bmp'].includes(datastr.substring(datastr.length - 4))) //embedded image link
    finaldatastr = '<a href="' + datastr + '" >' + datastr + '</a><br><img src="' + datastr + '" alt="User Image">';
  else if (linkRegex.test(datastr)) //regular link
    finaldatastr = '<a href="' + datastr + '" >' + datastr + '</a>';

  finaldatastr = usrname + finaldatastr;
  websock.send(finaldatastr);
}

function Broadcast(theMessage,username = '',ttype = '') {
  wss.clients.forEach(function each(client) {
    if (client !== ws && client.readyState === ws.OPEN) {
      SendMessage(client,theMessage, username, ttype);
    }
  });
}

function CountLetter(letter,str) {
  var x = 0;
  for(var y = 0;y < str.length;y++){
    if (str[y] == letter)
      x++;
  }
  return x;
}

function RandomString(length) {
  var pool = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var result = "";
  for (var x = 0; x < length;x++) {
    result += pool.charAt(Math.random() * pool.length - 1);
  }
  return result;
}

function SaveSessionsSync(filename) {
  var sessionsString = "";
  for (var i in sessions) {
    if (i.length > 0) sessionsString += i + '^' + sessions[i] + '\n';
  }
  fs.writeFileSync(filename, sessionsString);
  console.log('Saved sessions successfully.');
}

LoadSessions('sessions.txt');
function LoadSessions(filename) {
  console.log('Loading sessions..');

  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename,'');
    console.log('No session file found, creating..');
  }

  fs.readFile(filename,'utf8',function (err, data) {
    if (err) throw err;
    var j = 0;
    for (var x = 0; x < data.split('\n').length - 1;x++) {
      sessions[data.split('\n')[x].split('^')[0]] = data.split('\n')[x].split('^')[1];
      j++;
    }
    console.log('Loaded sessions successfully.');
  });
}

process.on('beforeExit', exitHandler.bind(false));
process.on('exit', exitHandler.bind(false));
process.on('SIGINT', exitHandler.bind());
process.on('SIGUSR1', exitHandler.bind());
process.on('SIGUSR2', exitHandler.bind());
process.on('uncaughtException', exitHandler.bind());
function exitHandler(exit = true) {
  if (exit) console.log('Exit detected, saving sessions..');
  SaveSessionsSync('sessions.txt');
  if (exit) process.exit();
}