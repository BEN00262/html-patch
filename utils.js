const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fsPromise = require('fs/promises');
const ejs = require('ejs');

class FileNotFoundException extends Error {
    constructor(filename) {
        super(`File ${filename} not found`);
        this.filename = filename;
    }
}

const fileLoader = (filePath) => 
    fs.readFileSync(path.join(process.cwd(), './views/', `${filePath}.ejs`), 'utf8');

const custom_render_function = async (_path) => {
    const root_path = path.join(process.cwd(), 'views', "\\");
    let requested_path = path.join(root_path, _path);
    requested_path = requested_path.replace(path.extname(requested_path), '');
    const template_file_path = path.join(process.cwd(), './views/', `${root_path === requested_path ? 'index' : path.basename(requested_path)}.ejs`);

    if (!fs.existsSync(template_file_path)) {
        throw new FileNotFoundException(template_file_path);
    }

    const [template_file, layout_file] = await Promise.all([
        fsPromise.readFile(template_file_path, 'utf8'),
        fsPromise.readFile(path.join(process.cwd(), './views/', "./layout.ejs"), 'utf8')
    ]);

    const template = await ejs.render(
        patch_get_data_to_be_awaitable(template_file),
        { get_data, include: fileLoader },
        { async: true }
    );

    return ejs.render(
        patch_get_data_to_be_awaitable(layout_file),
        {
            body: template,
            get_data, include: fileLoader 
        },
        { async: true }
    )
}


const build_folder = (folder_path) => {
    if (!fs.existsSync(folder_path)) {
        fs.mkdirSync(folder_path);
    }

    return folder_path;
}

const move_as_is_folders = (src_folder, dest) => {
    let exists = fs.existsSync(src_folder);
    let stats = exists && fs.statSync(src_folder);

    let isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        let dest_folder = build_folder(dest);

        for (const src of fs.readdirSync(src_folder)) {
            move_as_is_folders(
                path.join(src_folder, src), 
                path.join(dest_folder, src)
            );
        }

    } else {
        fs.copyFileSync(src_folder, dest);
    }
}

const DATA_DIRECTORY = "data"; // only json data files are supported

// we can fetch the data from a url or the filesystem ( if the url is a file )
const get_data = async (data_endpoint) => {
    if (data_endpoint.startsWith('http')) {
        const data = await axios.get(data_endpoint);
        
        if (!data.data) {
            throw new Error(`No data found at ${data_endpoint}`);
        }

        return data.data;
    } else {
        // read from the data directory and the file should be valid json
        const data_directory_path = path.join(process.cwd(), DATA_DIRECTORY, data_endpoint);

        if (fs.existsSync(data_directory_path)) {
            const data = fs.readFileSync(data_directory_path, 'utf8');

            try {
                return JSON.parse(data);
            } catch (e) {
                return data;
            }
        }
    }

    throw new Error(`No data found at ${data_endpoint}`);
}

const patch_get_data_to_be_awaitable = (raw_template_data) => 
    raw_template_data.replace(/get_data\((.*?)\)/g, (match, arg) => `(await get_data(${arg}))`);

module.exports = { move_as_is_folders, get_data, patch_get_data_to_be_awaitable, custom_render_function, FileNotFoundException}