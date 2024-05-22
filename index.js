const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const serveStatic = require('serve-static');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

// was nodig zodat ik een apart bestand kon hebben voor styling
// serve static files van de directory chatbox
app.use(serveStatic(join(__dirname, 'chatbox'), {
    // set custom http headers
    // res = response object - path = path to the file being served
    setHeaders: (res, path) => {
        // looks up de MIME type of the file based on its exctension
        if (serveStatic.mime.lookup(path) === 'text/css') {
            // als het een css file is zet Content-Type header to text/css
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// route handeler for get request
// req = request object - res = response object
app.get('/', (req, res) => {
    // stuurt file als response en joint de hele path als een string
    res.sendFile(join(__dirname, 'chatbox', 'ChatRoom.html'));
});

// event listener voor connectie event op object io (io = server - socket = client connectie)
io.on('connection', (socket) => {
    // event listener voor chat message event op object socket
    socket.on('chat message', (msg) => {
        // broadcast ontvangen bericht naar alle connected socket.io servers
        io.emit('chat message', msg);       
    });
});
// event listener voor connectie event op object io
io.on('connection', (socket) => {
    // event listerner voor naam invoer event op object socket, een argument usr
    socket.on('name', (usr) => {
        // broadcast ontvangen naam naar alle connected socket.io servers
        io.emit('name', usr);
    });
})

// start server en luisters for speciefieke connecties op port 3000
server.listen(3000, () => {
    // als de server goed is gestart zal bericht hieronder gelogged worden
    console.log('server is running at http://localhost:3000');
});