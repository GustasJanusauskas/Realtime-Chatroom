'use strict';
const url = 'ws://localhost:8079'; //change adress and switch to wss later
const connection = new WebSocket(url);

var usr, pass;
const VERBOSE_DEBUG = false;

function Log() {
    connection.send(usr.value + "^" + pass.value);
}

connection.onopen = () => {
    usr = document.getElementById("chatUser");
    pass = document.getElementById("chatPass");
}

connection.onerror = error => {
    if (VERBOSE_DEBUG) console.log(`WebSocket error: ${error}`);
}

connection.onmessage = (e) => {
    document.getElementById("chatErr").innerHTML = e.data;
}