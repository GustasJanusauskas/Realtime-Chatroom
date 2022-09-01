'use strict';
const url = 'ws://localhost:8079'; //change adress and switch to wss later
const connection = new WebSocket(url);

var usr, mail, pass;
const VERBOSE_DEBUG = false;


function Reg() {
    connection.send(usr.value + "^" + mail.value + "^" + pass.value);
}

connection.onopen = () => {
    usr = document.getElementById("chatUser");
    mail = document.getElementById("chatMail");
    pass = document.getElementById("chatPass");
}

connection.onerror = error => {
    if (VERBOSE_DEBUG) console.log(`WebSocket error: ${error}`);
}

connection.onmessage = (e) => {
    document.getElementById("chatErr").innerHTML = e.data;
}