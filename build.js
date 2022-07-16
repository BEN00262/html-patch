const { parse: parseHTML} = require('node-html-parser');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const consola = require('consola');
const prettifyHTML = require('pretty');

const { get_data, patch_get_data_to_be_awaitable } = require('./utils');

const DIRNAME = process.cwd(); // this is the current directory
const PUBLIC_DIRECTORY = "public"; // place css, images, js files here
const BUILD_FOLDER = "build"


// create the build folder to start damping the files to
const build_folder = (folder_name) => {
    const folder_path = path.join(DIRNAME, BUILD_FOLDER, folder_name);
    if (!fs.existsSync(folder_path)) {
        fs.mkdirSync(folder_path);
    }

    return folder_path;
}

const build_file = (file_name, file_content) => {
    const file_path_to_write = path.join(
        build_folder(path.dirname(file_name)), 
        path.basename(file_name)
    );
    fs.writeFileSync(file_path_to_write, file_content);
}

// this move folders as they are to the build folder
// copy the styles folder
// move the public folder around :)
const move_as_is_folders = (src_folder = PUBLIC_DIRECTORY, dest = ".") => {
    let exists = fs.existsSync(src_folder);

    if (exists) {
        let isDirectory = fs.statSync(src_folder).isDirectory();

        if (isDirectory) {
            let dest_folder = build_folder(src_folder);

            for (const src of fs.readdirSync(src_folder)) {
                move_as_is_folders(
                    path.join(DIRNAME, src_folder, src), 
                    path.join(dest_folder, src)
                );
            }

        } else {
            fs.copyFileSync(src_folder, dest);
        }
    }
}

function get_links(root, exclude = "") {
    return [...root.querySelectorAll('a')]
                .map(a => a.getAttribute('href'))
                .filter(a => a.startsWith('/'))
                .map(a => a.replace(/^\//, ''))
                .filter(a => a !== exclude)
}

// we only need to get the strings then we are
function rearrange_script_styles_links(root_code, template_code) {
    const from_node = parseHTML(root_code);
    const to_node = parseHTML(template_code);

    // somehow swap this ones after doing stuff
    let links = from_node.getElementsByTagName('link');
    let script = from_node.getElementsByTagName('script');
    let styles = from_node.getElementsByTagName('style');
    let from_head = from_node.querySelector('head'); // only take the first instance of the head

    for (const _link of [...links, ...script, ...styles, from_head].filter(x => x)) {
        from_node.removeChild(_link);
    }

    let head = to_node.querySelector('head');

    // TODO: rewrite the link href if they are relative ( to reflect the new path )
    for (const _link of [...links, ...styles]) {
        if (_link.tagName === 'LINK') {
            const existing_link = head.querySelector(`link[href="${_link.getAttribute('href')}"]`);

            if (existing_link) {
                const existing_link_attributes = existing_link.attributes;
                const _link_attributes = _link.attributes;

                for (const _link_attribute of Object.keys(_link_attributes)) {
                    if (!Object.keys(existing_link_attributes).includes(_link_attribute)) {
                        existing_link.setAttribute(_link_attribute, _link.getAttribute(_link_attribute));
                    }
                }

                // check if the link is relative and do the necessary rewrites
                // we need to find a clean way to join this stuff
                // if (_link.getAttribute('href').startsWith('/')) {
                //     existing_link.setAttribute('href', `/public${_link.getAttribute('href')}`);
                // }

                // console.log("We have found one", existing_link.getAttribute('href'));
                continue
            }
        }
        
        head.appendChild(_link);
    }

    // do a merge of the from_head with head
    // merge the head stuff ( but what if we have double style file inclusion )
    if (from_head) {
        for (const element of from_head.childNodes) {
            if (!element.tagName && element.innerText) {
                head.appendChild(element);
                continue;
            }

            if (head.querySelector(element.tagName.toLowerCase())) {
                if (element.tagName === 'META') {
                    let _meta = head.querySelector(`meta[name="${element.getAttribute('name')}"]`);
                    if (_meta) {
                        _meta.setAttribute('content', element.getAttribute('content'));
                    } else {
                        head.appendChild(element);
                    }
                } else {
                    head.exchangeChild(
                        head.querySelector(element.tagName.toLowerCase()),
                        element
                    )
                }
            } else {
                head.appendChild(element);
            }
        }
    }

    // for scripts we append to the body
    let body = to_node.querySelector('body');

     // intelligently append the script
    for (const _script of script) {
        const existing_script = body.querySelector(`script[src="${_script.getAttribute('src')}"]`);

        if (existing_script) {
            const existing_script_attributes = existing_script.attributes;
            const _script_attributes = _script.attributes;
            for (const _script_attribute of Object.keys(_script_attributes)) {
                if (!Object.keys(existing_script_attributes).includes(_script_attribute)) {
                    existing_script.setAttribute(_script_attribute, _script.getAttribute(_script_attribute));
                }
            }

            continue;
        }

        body.appendChild(_script);
    }

    return ejs.compile(to_node.toString())({ body: from_node });
}

const requested_path = (start_file) => path.join(DIRNAME, 'views', start_file + '.ejs');

// use the express-layout shit to generate the files to crawl
const crawl_pages = async ({ template, root_file }) => {
    const crawled_links = []; // { path: "/", content: "...", links: [] }
    let precompiled_template = '';

    let template_compiled = ({ body }) => {
        if (!body) {
            throw new Error("Expected a body in the options")
        }

        return body
    }

    if (template) {
        template_compiled = ejs.compile(
            fs.readFileSync(requested_path(template), 'utf8'),
            { filename: path.resolve(requested_path(template)) }
        );
    }


    async function get_crawl_links(isLayout = false, start_link = 'index') {
        let root = null;
    
        // we get the links and we are good to go
        if (isLayout) {
            // we want to reuse the precompiled template
            if (!precompiled_template) {
                precompiled_template = template_compiled({ body: '<%- body -%>' })
            }

            root = parseHTML(precompiled_template);
        } else {
            let crawled_page = crawled_links.find(c => c.path === start_link);

            if (!crawled_page) {
                root = parseHTML(
                    await ejs.render(
                        patch_get_data_to_be_awaitable(
                            fs.readFileSync(
                                requested_path(start_link.replace(/\\/g, '/')), 
                                'utf8'
                            ),
                        ),
                        { get_data },
                        { async: true }
                    )
                );

                crawled_links.push({
                    path: start_link,
                    content: root.toString(),
                    links: []
                });

                // it has already been crawled
                return root ? get_links(root) : [];
            }

            return []
        }
    
        // we get the html of the file
        return root ? get_links(root) : [];
    }

    let links_to_crawl = [];

    // we start with the links at the layout stage
    if (template) {
        links_to_crawl.push(...(await get_crawl_links(true)));

        // loop through the links and get other links
        for (const link of links_to_crawl) {
            // start_link
            let links = await get_crawl_links(false, link);
            
            const saved_link_state_index = crawled_links.findIndex(c => c.path === link);
            if (saved_link_state_index === -1) {
                throw new Error("Failed to save state while parsing the links");
            }

            crawled_links[saved_link_state_index].links = [
                ...crawled_links[saved_link_state_index].links,
                ...links
            ];

            links_to_crawl.push(...links);
        }
    }

    // i know this might be inefficient but i don't care
    if (root_file) {
        links_to_crawl.push(...(await get_crawl_links(false, root_file)));
    }

    links_to_crawl = [...new Set(links_to_crawl)]
        .map(x => x.replace(/\\/g, '/'));

    // we need to fill out all the details of a the layout first before moving on
    if (template) {
        // first substitute the links in the template then recompile it :)
        if (!precompiled_template) {
            precompiled_template = template_compiled({ body: '<%- body -%>' })
        }

        // use the precompiled template
        let resp = precompiled_template;

        // we search for the links and do the necessary replacements
        for (const link of links_to_crawl) {
            // replace any relevant link
            resp = resp.replace(
                new RegExp(`href="/${link}"`, 'g'),
                `href="/${link}.html"`
            );
        }

        // we should also update this part to update the precompiled template
        let template_compiler = ejs.compile(resp);
        template_compiled = template_compiler;
        precompiled_template = template_compiler({ body: '<%- body -%>' })
    }

    // now loop through and generate the files
    for (const link of links_to_crawl) {
        let crawled_link_state = crawled_links.find(c => c.path === link);

        if (!crawled_link_state) {
            throw new Error(`${link} was not found in the crawled links`)
        }

        let html_data = crawled_link_state.content;

        // we search for the links and do the necessary replacements
        for (const _link of crawled_link_state.links) {
            html_data = html_data.replace(
                new RegExp(`href="/${_link}"`, 'g'),
                `href="/${_link}.html"`
            );
        }

        // write the file to disk
        build_file(
            `${link}.html`, 
            prettifyHTML(
                // patch the links | scripts | styles
                rearrange_script_styles_links(
                    html_data, // the root node
                    precompiled_template ? precompiled_template : template_compiled({ body: '<%- body -%>' }) // the to node
                ),

                // remove all white spaces and stuff
                { ocd: true }
            )
        );
    }
}


module.exports = () => {
    crawl_pages({ template: 'layout'})
    .then(_ => { 
        move_as_is_folders();
        
        // bundle the files and then we are done :)
    })
    .catch(err => { consola.error(err.message) })
}