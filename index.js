const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const serveStatic = require('serve-static');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
var socketlist = [];

console.log('Starting server setup process...');

// functie die bepaalde characters verwijderd zodat het opgeslagen kan worden in database
// Anders krijg je een error
function escapeHtml(unsafe) {
    if (typeof unsafe === 'string') {
        return unsafe.replace(/[&<"'>]/g, function(match) {
            switch (match) {
                case '&':
                    return '&amp;';
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '"':
                    return '&quot;';
                case "'":
                    return '&#039;';
            }
        });
    } else {
        return unsafe;
    }
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
        connectionStateRecovery: {}
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
    });

    app.post('/delete-database', (req, res) => {
        const dbFilePath = join(__dirname, 'chat.db');
        fs.unlink(dbFilePath, (err) => {
            if (err) {
                console.log('Error deleting database file:', err);
            }
            console.log('Database file deleted successfully');
            setTimeout(() => {
                io.close();
            }, 1000);
            // server herstarten na het verwijderen van de database file
        });
    });

    console.log('Starting server...');
    startServer();

    function startServer() {
        // start server op port 3000
        server.listen(3000, () => {
            // als de server goed is gestart zal bericht hieronder gelogged worden
            console.log(`server is running at http://localhost:3000`);
        });
    }

    
    console.log('Setting up socket.io connection...');
    // event listener voor connectie event op object io (io = server - socket = client connectie)
    io.on('connection', async (socket) => {
        socketlist.push(socket);
        console.log('New connection established');
        try {
            // event listener voor chat message event op object socket
            socket.on('chat message', async (msg, clientOffset, callback) => {
                let result;
                try {
                    console.log('Inserting message:', msg, clientOffset);
                    const escapedMsg = {
                        text: escapeHtml(msg.text),
                        time: escapeHtml(msg.time)
                    };
                    console.log('Escaped message:', escapedMsg)
                    // store the sanitized message in the database
                    result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', JSON.stringify(escapedMsg), clientOffset);
                    // broadcast ontvangen bericht naar alle connected socket.io servers
                    io.emit('chat message', escapedMsg, result.lastID);
                    callback();       
                } catch (e) {
                    if (e.errno === 19 /* SQLITE_CONSTRAINT*/) {
                        callback();
                    } else {
                        console.error('Error inserting message:', e);
                        callback();
                    }
                }
            });
        
            if (!socket.recovered) {
                // als de connection tate recovery niet werkte
                try {
                    await db.each('SELECT id, content FROM messages WHERE id > ?',
                        [socket.handshake.auth.serverOffset || 0],
                        (_err, row) => {
                            socket.emit('chat message', JSON.parse(row.content), row.id);
                        });
                } catch (e) {
                    console.error('Error sending previous messages:', e);
                }
            }
            socket.on('close', function () {
                console.log('Socket closed');
                socketlist.splice(socketlist.indexOf(socket), 1);
            });
        
            // Chatnaam event listener
            socket.on('name', (usr) => {
                // broadcast ontvangen naam naar alle connected socket.io servers
                io.emit('name', usr);
            });
        } catch (error) {
            error.log('Fout in connectie handeler:', error);
        }
    
    });
    
}


main().catch(err => {
console.error('Error in main function:', err);
});