const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const serveStatic = require('serve-static');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { availableParallelism } = require('node:os');
const cluster = require('node:cluster');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');

console.log('Starting server setup...');

if (cluster.isPrimary) {
    const numCPUs = availableParallelism(); 
    // maak een werker per core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork({
            PORT: 3000 + i
        });
    }
    return setupPrimary();
}

async function main() {
console.log('Opening database...');
// opent database file
const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
});

console.log('Creating messages table...');
// maakt bericht tabel
await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
    );
`);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {},
    adapter: createAdapter()
});

console.log('Setting up static file serving...');
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

console.log('Setting up route handler...');
// route handeler for get request
// req = request object - res = response object
app.get('/', (req, res) => {
    // stuurt file als response en joint de hele path als een string
    res.sendFile(join(__dirname, 'chatbox', 'ChatRoom.html'));
    console.log('Opening file...')
});

console.log('Setting up socket.io connection...');
// event listener voor connectie event op object io (io = server - socket = client connectie)
io.on('connection', async (socket) => {
    console.error('New connection established');
    // event listener voor chat message event op object socket
    socket.on('chat message', async (msg, clientOffset, callback) => {
        let result;
        try {
            // store the message in the database
            result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
        } catch (e) {
            if (e.errno === 19 /* SQLITE_CONSTRAINT*/) {
                callback();
            } else {
                console.error('Error inserting message:', e);
                callback();
            }
            // als het fout handelt
            return;
        }
        // broadcast ontvangen bericht naar alle connected socket.io servers
        io.emit('chat message', msg, result.lastID);
        callback();       
    });

    if (!socket.recovered) {
        // als de connection tate recovery niet werkte
        try {
            await db.each('SELECT id, content FROM messages WHERE id > ?',
                [socket.handshake.auth.serverOffset || 0],
                (_err, row) => {
                    socket.emit('chat message', row.content, row.id);
                }
            );
        } catch (e) {
            console.error('Error sending previous messages:', e);
        }
    }

    // Chatnaam event listener
    socket.on('name', (usr) => {
        // broadcast ontvangen naam naar alle connected socket.io servers
        io.emit('name', usr);
    });
    
    const port = process.env.PORT;
    // start server en luisters for speciefieke connecties op port 3000
    server.listen(port, () => {
        // als de server goed is gestart zal bericht hieronder gelogged worden
        console.log(`server is running at http://localhost:${port}`);
    });
});
}

main().catch(err => {
console.error('Error in main function:', err);
});



