// The main entry point
const { Command } = require('commander');
const path = require('path');
const build = require('./build');
const {move_as_is_folders} = require("./utils")

const program = new Command();
program.version('0.0.1');

program
    .option('-i, --init <string>', 'init the project','sample')
    .option('-d, --dev', 'watch the project')
    .option('-b, --build', 'build the project');

const PROJECT_FOLDER = process.cwd();

function main() {
    program.parse(process.argv);

    const options = program.opts();

    // on initing the project copy the tenplate to the project folder
    if (options.init) {
        const templatePath = path.join(__dirname, './template');
        move_as_is_folders(templatePath, path.join(PROJECT_FOLDER, options.init), false);
    }

    // on building the project
    if (options.build) {
        build();
    }

    // on watching the project
    if (options.dev) {
        const dev = require('./dev');
        dev();
    }
}

module.exports = main