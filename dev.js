// this is the very beginning of a very short project
const http = require('http');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const prettifyHTML = require('pretty');
const { parse: parseHTML } = require('node-html-parser');
const { Server: SocketIOServer } = require('socket.io');
const { Worker } = require('worker_threads');

const DEV_PORT = +process.env.PORT || 3000;

// the dev server
const app = express();
const http_server = http.createServer(app);

app.use(expressLayouts);
app.set('view engine', 'ejs');

// create the socketio listener for hot reloading the stuff
const io = new SocketIOServer(http_server, {
    cors: "*",
});

// this is the only thing that we require
app.get("*", (req, res) => {
    const root_path = path.join(__dirname, 'views', "\\");
    let requested_path = path.join(root_path, req.path);
    requested_path = requested_path.replace(path.extname(requested_path), '');

    res.render(root_path === requested_path ? 'index' : path.basename(requested_path), {}, (err, html) => {
        if (!err) {
            const root = parseHTML(html);
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
        }
    })
})

module.exports = async () => {
    http_server.listen(DEV_PORT, () => {
        console.log(`dev server is listening at http://localhost:${DEV_PORT}`);
    })

    ;(() => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, './watch.js'));
            worker.on('message', (data) => {
                io.emit('hot-reload');
            });

            worker.on('error', reject);

            worker.on('exit', (code) => {
                if (code !== 0)
                    reject(new Error(`stopped with  ${code} exit code`));
            })
        })
    })().catch(console.error);
}
