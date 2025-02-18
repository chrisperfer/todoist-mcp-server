#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

const VALID_COLORS = ['berry_red', 'red', 'orange', 'yellow', 'olive_green', 'lime_green', 'green', 'mint_green', 'teal', 'sky_blue', 'light_blue', 'blue', 'grape', 'violet', 'lavender', 'magenta', 'salmon', 'charcoal', 'grey', 'taupe'];
const VALID_VIEWS = ['list', 'board'];

function printHelp() {
    console.log(`
Usage: update-project.js --id <project_id> [options]

Required:
    --id <project_id>         Project ID to update

Options:
    --name <name>            New project name
    --color <color>          Project color (${VALID_COLORS.join(', ')})
    --view <view>            View style (${VALID_VIEWS.join(', ')})
    --favorite               Mark as favorite
    --no-favorite           Remove from favorites
    --json                  Output result as JSON
    --help                  Show this help message

Example:
    update-project.js --id 123456789 --name "New Name" --color blue --view board
`);
    process.exit(0);
}

async function updateProject(projectId, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!projectId) {
            console.error("Error: Project ID is required (use --id)");
            process.exit(1);
        }

        // Validate color if provided
        if (options.color && !VALID_COLORS.includes(options.color)) {
            console.error(`Error: Invalid color. Valid colors are: ${VALID_COLORS.join(', ')}`);
            process.exit(1);
        }

        // Validate view if provided
        if (options.view && !VALID_VIEWS.includes(options.view)) {
            console.error(`Error: Invalid view style. Valid views are: ${VALID_VIEWS.join(', ')}`);
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Verify project exists
            const project = await api.getProject(projectId);
            
            // Create update object
            const updateData = {
                ...(options.name && { name: options.name }),
                ...(options.color && { color: options.color }),
                ...(options.view && { viewStyle: options.view }),
                ...(options.favorite !== undefined && { isFavorite: options.favorite })
            };

            // Update the project
            await api.updateProject(projectId, updateData);
            
            // Get updated project
            const updatedProject = await api.getProject(projectId);

            // Output the updated project
            if (options.json) {
                console.log(JSON.stringify(updatedProject, null, 2));
            } else {
                console.log(`Project updated: ${updatedProject.id}`);
                console.log(`Name: ${updatedProject.name}`);
                if (updatedProject.parentId) console.log(`Parent ID: ${updatedProject.parentId}`);
                if (updatedProject.color) console.log(`Color: ${updatedProject.color}`);
                if (updatedProject.viewStyle) console.log(`View Style: ${updatedProject.viewStyle}`);
                console.log(`Favorite: ${updatedProject.isFavorite ? 'Yes' : 'No'}`);
                console.log(`URL: ${updatedProject.url}`);
            }

        } catch (apiError) {
            if (apiError.httpStatusCode === 404) {
                console.error(`Error: Project with ID "${projectId}" not found`);
            } else {
                console.error("API Error:", apiError.message);
            }
            process.exit(1);
        }
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--help')) {
    printHelp();
}

const options = {
    json: args.includes('--json'),
    name: null,
    color: null,
    view: null
};

let projectId = null;

// Parse options
for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--id':
            if (i + 1 < args.length) projectId = args[++i];
            break;
        case '--name':
            if (i + 1 < args.length) options.name = args[++i];
            break;
        case '--color':
            if (i + 1 < args.length) options.color = args[++i];
            break;
        case '--view':
            if (i + 1 < args.length) options.view = args[++i];
            break;
        case '--favorite':
            options.favorite = true;
            break;
        case '--no-favorite':
            options.favorite = false;
            break;
    }
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    updateProject(projectId, options);
}

export { updateProject }; 