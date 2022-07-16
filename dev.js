const http = require('http');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const prettifyHTML = require('pretty');
const consola = require('consola');
const open = require('open');
var favicon = require('serve-favicon');
const { parse: parseHTML } = require('node-html-parser');
const { Server: SocketIOServer } = require('socket.io');
const { Worker } = require('worker_threads');

const { custom_render_function, FileNotFoundException } = require('./utils');

const DEV_PORT = +process.env.PORT || 3000;

// the dev server
const app = express();
const http_server = http.createServer(app);

app.use(expressLayouts);
app.set('view engine', 'ejs');
app.use(favicon(path.join(process.cwd(), 'public', 'favicon.ico')));
app.use(express.static(path.join(process.cwd(), 'public')));

// create the socketio listener for hot reloading the stuff
const io = new SocketIOServer(http_server, { cors: "*" });

// this is the only thing that we require
app.get("*", async (req, res) => {
    try {
        const root = parseHTML(await custom_render_function(req.path));

        root.querySelector('head').appendChild(
            parseHTML(`
                <script type="module">
                    import { io } from "https://cdn.socket.io/4.4.1/socket.io.esm.min.js";
            
                    const socket = io();
                    
                    socket.on('hot-reload', () => {
                        window.location.reload();
                    })
                </script>
            `)
        );

        return res.send(prettifyHTML(root.toString()));
    } catch(error) {
        if (error instanceof FileNotFoundException) {
            return res.status(404).send(`<h1>404</h1>`);
        }

        throw res.status(500).send(`<h1>Error</h1><pre>${error.stack}</pre>`);
    }
})

module.exports = async () => {
    http_server.listen(DEV_PORT, () => {
        const app_link = `http://localhost:${DEV_PORT}`;
        consola.success(`Dev server is listening at ${app_link}`);
        open(app_link);
    })

    ;(() => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, './watch.js'));
            worker.on('message', (data) => { io.emit('hot-reload') });

            worker.on('error', reject);

            worker.on('exit', (code) => {
                if (code !== 0)
                    reject(new Error(`stopped with  ${code} exit code`));
            })
        })
    })().catch(console.error);
}
