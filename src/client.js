'use strict';
const url = 'ws://localhost:8080'; //change adress and switch to wss later
const connection = new WebSocket(url);

var date = new Date();

var chat;
var sendBox;
var scrollBox;
var roomBox;

const VERBOSE_DEBUG = false;

connection.onopen = () => {
    chat = document.getElementById("chatWindow");
    sendBox = document.getElementById("chatText");
    scrollBox = document.getElementById("scrollCheck");
    roomBox = document.getElementById("chatRoomInput");

    var chatRoom = roomBox.value;
    if (chatRoom.length == 0) chatRoom = 'default';
    LoadRooms();

    connection.send('^connected^' + getCookie('session') + '^' + chatRoom);
    if (scrollBox.checked) setTimeout(function () {chat.scrollBy(0,99999)},1000);
}

connection.onerror = error => {
    if (VERBOSE_DEBUG) console.log(`WebSocket error: ${error}`);
}

connection.onmessage = (e) => {
    chat.innerHTML += e.data + "<br>";
    if (scrollBox.checked) {
        chat.scrollBy(0,99999);
    }
}

var lastcode;
function TextBoxPressed(e) {
    var keypress = e.which || e.keyCode;
    if (lastcode == 17 && keypress == 13) SendMessage();
    lastcode = keypress;
}

function GetMessages(getRoom) {
    chat.innerHTML = '';

    var chatRoom;
    if (!getRoom) {
        chatRoom = roomBox.value;
        if (chatRoom.length == 0) chatRoom = 'default';
    }
    else chatRoom = getRoom;

    connection.send('^connected^' + getCookie('session') + '^' + chatRoom);
}

function SendMessage() {
    if (sendBox.value.trim().length == 0) return;
    sendBox.placeholder = "Your message here.";

    var chatRoom = roomBox.value;
    if (chatRoom.length == 0) chatRoom = 'default';

    if (!getCookie('session'))
        connection.send(sendBox.value.replace('^','') + "^Guest^" + chatRoom);
    else
        connection.send(sendBox.value.replace('^','') + "^" + getCookie('session') + "^" + chatRoom);

    sendBox.value = "";
}

function SendFile(file) {
    if (file.size <= 4194304) { //4MB
        var reader = new FileReader();
        reader.onload = function(event) {
            var contents = event.target.result;
            var finalstring = contents.substr(contents.indexOf("base64,") + "base64,".length);
            finalstring += "^" + getCookie('session') + "^" + file.name.split('.')[file.name.split('.').length - 1];
            if (VERBOSE_DEBUG) console.log("File Uploaded. Size: " + file.size);
            if (VERBOSE_DEBUG) console.log("File Excerpt: " + finalstring.substr(0,50));
            connection.send(finalstring);
        };
        reader.onerror = function(event) {
            console.error("File could not be read! Code " + event.target.error.code);
            return;
        };

        reader.readAsDataURL(file);
    }
    else
        sendBox.placeholder = "FILE TOO LARGE TO UPLOAD. MAX FILE SIZE: 4MB.";
}

function AddRoom(roomName = "") {
    var rooms = document.getElementById('chatSavedRooms');
    var rinput = document.getElementById('chatRoomInput');
    var room = rinput.value;

    if (roomName) room = roomName;
    room = room.replace(/[^a-zA-Z0-9 ]/g, "");

    if (!rooms.innerHTML.includes('>' + room + '<'))
        rooms.innerHTML += '<button class="roomButton" onclick="GetMessages(this.innerHTML)">' + room + '</button><br>';

    SaveRooms();
}

var roomRegex = /onclick\=\"GetMessages\(this.innerHTML\)\"\>([a-z]|[A-Z]|[0-9])*\<\/button\>/gm;
function SaveRooms() {
    DeleteRooms();
    var rooms = document.getElementById('chatSavedRooms').innerHTML;
    var roomsSplit = rooms.match(roomRegex);
    var d = new Date();
    d.setTime(d.getTime() + (365*50*24*60*60*1000)); //50 years in the future(never expire)

    for (var x = 0; x < roomsSplit.length;x++) {
        roomsSplit[x] = roomsSplit[x].replace('onclick="GetMessages(this.innerHTML)">','').replace('</button>','');
        document.cookie = 'room' + x + '=' + roomsSplit[x] + ';expires=' + d.toUTCString();
    }
}

function LoadRooms() {
    for (var x = 0; x < 1000;x++) {
        if (getCookie('room' + x)) AddRoom(getCookie('room' + x));
        else break;
    }
}

function DeleteRooms() {
    for (var x = 0; x < 1000;x++) {
        if (getCookie('room' + x)) deleteCookie(getCookie('room' + x));
    }
}

function getCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function deleteCookie( name ) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
}

function ScrollChecked() {
    if (scrollBox.checked) chat.scrollBy(0,99999);
}

function dropHandler(ev) {
    ev.preventDefault();
    if (ev.dataTransfer.items) {
        for (var i = 0; i < ev.dataTransfer.items.length; i++) {
          if (ev.dataTransfer.items[i].kind === 'file') {
            var file = ev.dataTransfer.items[i].getAsFile();
            SendFile(file);
          }
        }
      } else {
        for (var i = 0; i < ev.dataTransfer.files.length; i++) {
            var file = ev.dataTransfer.files[i];
            SendFile(file);
        }
      }
}

function DragOverHandler(event) {
    event.preventDefault();
}