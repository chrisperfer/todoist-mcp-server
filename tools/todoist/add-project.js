#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function addProject(name, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!name) {
            console.error("Error: Project name is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Create project object with direct parentId if specified
            const projectData = {
                name: name,
                ...(options.parentId && { parentId: options.parentId }),
                ...(options.color && { color: options.color }),
                ...(options.favorite && { isFavorite: true }),
                ...(options.view && { viewStyle: options.view })
            };

            // Add the project
            const project = await api.addProject(projectData);

            // Output the created project
            if (options.json) {
                console.log(JSON.stringify(project, null, 2));
            } else {
                console.log(`Project created: ${project.id}`);
                console.log(`Name: ${project.name}`);
                if (options.parentId) console.log(`Parent ID: ${options.parentId}`);
                if (project.color) console.log(`Color: ${project.color}`);
                if (project.viewStyle) console.log(`View Style: ${project.viewStyle}`);
                console.log(`Favorite: ${project.isFavorite ? 'Yes' : 'No'}`);
                console.log(`URL: ${project.url}`);
            }

        } catch (apiError) {
            console.error("API Error:", apiError.message);
            throw apiError;
        }
    } catch (error) {
        console.error("Error in script:", error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    json: args.includes('--json'),
    parentId: null,
    color: null,
    view: null,
    favorite: args.includes('--favorite')
};

// Get project name (everything before the first -- flag or all args if no flags)
const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
const name = firstFlagIndex === -1 
    ? args.join(' ')
    : args.slice(0, firstFlagIndex).join(' ');

// Parse other options
let i = firstFlagIndex;
while (i !== -1 && i < args.length) {
    switch (args[i]) {
        case '--parentId':
            if (i + 1 < args.length) options.parentId = args[++i];
            break;
        case '--color':
            if (i + 1 < args.length) options.color = args[++i];
            break;
        case '--view':
            if (i + 1 < args.length) options.view = args[++i];
            break;
    }
    i++;
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    addProject(name, options);
}

export { addProject }; 