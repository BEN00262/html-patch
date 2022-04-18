const fs = require('fs');
const path = require('path');

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

module.exports = {
    move_as_is_folders
}