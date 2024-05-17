const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const serveStatic = require('serve-static');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(serveStatic(join(__dirname, 'chatbox'), {
    setHeaders: (res, path) => {
        if (serveStatic.mime.lookup(path) === 'text/css') {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'chatbox', 'ChatRoom.html'));
});

io.on('connection', (socket) => {
    console.log('connected');
    socket.on('chat message', (msg) => {
        console.log('Received message 1:', msg.text);
        console.log('Received time 1:', msg.time);
    io.emit('chat message', msg);       
    });
});

server.listen(3000, () => {
    console.log('server is running at http://localhost:3000');
});