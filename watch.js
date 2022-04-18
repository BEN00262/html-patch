const { parentPort } = require('worker_threads')
const node_watch = require('node-watch');
const path = require('path');

// the file watcher
// run this in a different location
// 
node_watch(path.join(process.cwd(), './views'), { recursive: true }, function(evt, name) {
    console.log('%s changed.', name);
    parentPort.postMessage({ changed: name })
});