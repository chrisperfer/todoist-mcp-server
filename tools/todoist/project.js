#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
    initializeApi,
    getProjectPath,
    executeSyncCommand,
    executeSyncCommands,
    formatJsonOutput
} from './lib/task-utils.js';
import {
    resolveProjectId
} from './lib/id-utils.js';

const VALID_COLORS = ['berry_red', 'red', 'orange', 'yellow', 'olive_green', 'lime_green', 'green', 'mint_green', 'teal', 'sky_blue', 'light_blue', 'blue', 'grape', 'violet', 'lavender', 'magenta', 'salmon', 'charcoal', 'grey', 'taupe'];
const VALID_VIEWS = ['list', 'board'];

async function addProject(api, name, options) {
    let parentId;
    if (options.parentId) {
        try {
            parentId = options.parentId;
        } catch (error) {
            console.error(`Error: Parent project ID "${options.parentId}" not found`);
            process.exit(1);
        }
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

    const command = {
        type: 'project_add',
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
            name,
            ...(parentId && { parent_id: parentId.toString() }),
            ...(options.color && { color: options.color }),
            ...(options.view && { view_style: options.view }),
            ...(options.favorite && { is_favorite: true })
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Get the newly created project
    const projects = await api.getProjects();
    const newProject = projects.find(p => 
        p.name === name && 
        (!parentId || p.parentId === parentId.toString())
    );

    if (options.json) {
        console.log(formatJsonOutput(newProject, 'created', {
            parent: parentId ? await getProjectPath(api, parentId) : undefined
        }));
    } else {
        console.log(`Project created: ${newProject.id}`);
        console.log(`Name: ${newProject.name}`);
        if (parentId) {
            console.log(`Parent: ${await getProjectPath(api, parentId)}`);
        }
        if (newProject.color) console.log(`Color: ${newProject.color}`);
        if (newProject.viewStyle) console.log(`View Style: ${newProject.viewStyle}`);
        console.log(`Favorite: ${newProject.isFavorite ? 'Yes' : 'No'}`);
        console.log(`URL: ${newProject.url}`);
    }
}

async function bulkAddProjects(api, projects, options) {
    let parentId;
    if (options.parentId) {
        try {
            parentId = options.parentId;
        } catch (error) {
            console.error(`Error: Parent project ID "${options.parentId}" not found`);
            process.exit(1);
        }
    }

    // Create commands for each project
    const commands = projects.map(name => ({
        type: 'project_add',
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
            name,
            ...(parentId && { parent_id: parentId.toString() }),
            ...(options.color && { color: options.color }),
            ...(options.view && { view_style: options.view }),
            ...(options.favorite && { is_favorite: true })
        }
    }));

    await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    // Get the newly created projects
    const allProjects = await api.getProjects();
    const newProjects = allProjects.filter(p => 
        projects.includes(p.name) && 
        (!parentId || p.parentId === parentId.toString())
    );

    if (options.json) {
        console.log(JSON.stringify({
            projects: await Promise.all(newProjects.map(async project => ({
                ...project,
                parentPath: parentId ? await getProjectPath(api, parentId) : undefined
            }))),
            status: 'created',
            count: newProjects.length
        }, null, 2));
    } else {
        console.log(`Added ${newProjects.length} projects:`);
        for (const project of newProjects) {
            console.log(`\nProject: ${project.name}`);
            console.log(`ID: ${project.id}`);
            if (parentId) {
                console.log(`Parent: ${await getProjectPath(api, parentId)}`);
            }
            if (project.color) console.log(`Color: ${project.color}`);
            if (project.viewStyle) console.log(`View Style: ${project.viewStyle}`);
            console.log(`Favorite: ${project.isFavorite ? 'Yes' : 'No'}`);
            console.log(`URL: ${project.url}`);
        }
    }
}

async function updateProject(api, projectQuery, options) {
    let project;
    try {
        const projectId = await resolveProjectId(api, projectQuery);
        const projects = await api.getProjects();
        project = projects.find(p => p.id === projectId);
    } catch (error) {
        console.error(`Error: Project "${projectQuery}" not found`);
        process.exit(1);
    }

    const updateData = {};
    if (options.name) updateData.name = options.name;
    if (options.color) {
        if (!VALID_COLORS.includes(options.color)) {
            console.error(`Error: Invalid color. Valid colors are: ${VALID_COLORS.join(', ')}`);
            process.exit(1);
        }
        updateData.color = options.color;
    }
    if (options.view) {
        if (!VALID_VIEWS.includes(options.view)) {
            console.error(`Error: Invalid view style. Valid views are: ${VALID_VIEWS.join(', ')}`);
            process.exit(1);
        }
        updateData.view_style = options.view;
    }
    if (options.favorite !== undefined) {
        updateData.is_favorite = options.favorite;
    }

    // If moving to a different parent
    if (options.parentId) {
        try {
            updateData.parent_id = options.parentId.toString();
        } catch (error) {
            console.error(`Error: Parent project ID "${options.parentId}" not found`);
            process.exit(1);
        }
    }

    const command = {
        type: 'project_update',
        uuid: randomUUID(),
        args: {
            id: project.id,
            ...updateData
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Get the updated project
    const updatedProjects = await api.getProjects();
    const updatedProject = updatedProjects.find(p => p.id === project.id);

    if (options.json) {
        console.log(formatJsonOutput(updatedProject, 'updated', {
            originalParent: project.parentId ? await getProjectPath(api, project.parentId) : undefined,
            newParent: updateData.parent_id ? 
                await getProjectPath(api, updateData.parent_id) : 
                undefined
        }));
    } else {
        console.log(`Project updated: ${updatedProject.name}`);
        console.log(`ID: ${updatedProject.id}`);
        if (updateData.parent_id) {
            console.log(`From parent: ${project.parentId ? await getProjectPath(api, project.parentId) : 'None'}`);
            console.log(`To parent: ${await getProjectPath(api, updateData.parent_id)}`);
        } else if (updatedProject.parentId) {
            console.log(`Parent: ${await getProjectPath(api, updatedProject.parentId)}`);
        }
        if (updateData.color) console.log(`New color: ${updateData.color}`);
        if (updateData.view_style) console.log(`New view style: ${updateData.view_style}`);
        if (options.favorite !== undefined) console.log(`Favorite: ${updatedProject.isFavorite ? 'Yes' : 'No'}`);
    }
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .usage('Usage: $0 <command> [options]')
        // Add project examples
        .example('$0 add --name "FLOOBY Project 📁" --color "blue" --favorite', 'Create a new project')
        .example('$0 add --name "FLOOBY Sub-Project 📁" --parentId "2349336695" --view "board"', 'Create a sub-project')
        .example('$0 add --name "Work Project 📊" --color "red" --view "list"', 'Create project with specific view')
        // Bulk add examples
        .example('$0 bulk-add --names "Project 1 📁" "Project 2 📁" --color "blue"', 'Create multiple projects')
        .example('$0 bulk-add --names "Sprint 1 📊" "Sprint 2 📊" --parentId "2349336695" --view "board"', 'Create multiple sub-projects')
        .example('$0 bulk-add --names "Q1 Goals 🎯" "Q2 Goals 🎯" --color "red" --favorite', 'Create multiple favorite projects')
        // Update examples
        .example('$0 update --project "2349336695" --name "Updated FLOOBY 📁" --color "green"', 'Update project name and color')
        .example('$0 update --project "2349336695" --parentId "8903766822" --view "board"', 'Move project and change view')
        .example('$0 update --project "2349336695" --favorite', 'Toggle project favorite status')
        .command('add', 'Add a new project', {
            name: {
                description: 'Project name',
                type: 'string',
                demandOption: true
            },
            parentId: {
                description: 'Parent project ID',
                type: 'string'
            },
            color: {
                description: 'Project color',
                type: 'string',
                choices: VALID_COLORS
            },
            view: {
                description: 'View style',
                type: 'string',
                choices: VALID_VIEWS
            },
            favorite: {
                description: 'Set as favorite',
                type: 'boolean',
                default: false
            },
            json: {
                description: 'Output in JSON format',
                type: 'boolean',
                default: false
            }
        })
        .command('bulk-add', 'Add multiple projects', {
            names: {
                description: 'Project names (use quotes for multi-word names, e.g., --names "First Project" "Second Project")',
                type: 'array',
                demandOption: true,
                string: true,
                coerce: args => args.map(arg => arg.trim())
            },
            parentId: {
                description: 'Parent project ID',
                type: 'string'
            },
            color: {
                description: 'Project color',
                type: 'string',
                choices: VALID_COLORS
            },
            view: {
                description: 'View style',
                type: 'string',
                choices: VALID_VIEWS
            },
            favorite: {
                description: 'Set as favorite',
                type: 'boolean',
                default: false
            },
            json: {
                description: 'Output in JSON format',
                type: 'boolean',
                default: false
            }
        })
        .command('update', 'Update a project', {
            project: {
                description: 'Project ID or name to update',
                type: 'string',
                demandOption: true
            },
            name: {
                description: 'New project name',
                type: 'string'
            },
            parentId: {
                description: 'New parent project ID',
                type: 'string'
            },
            color: {
                description: 'New project color',
                type: 'string',
                choices: VALID_COLORS
            },
            view: {
                description: 'New view style',
                type: 'string',
                choices: VALID_VIEWS
            },
            favorite: {
                description: 'Set as favorite',
                type: 'boolean'
            },
            json: {
                description: 'Output in JSON format',
                type: 'boolean',
                default: false
            }
        })
        .demandCommand(1, 'You must provide a valid command')
        .help()
        .argv;

    const api = await initializeApi();

    switch (argv._[0]) {
        case 'add':
            await addProject(api, argv.name, argv);
            break;
        case 'bulk-add':
            await bulkAddProjects(api, argv.names, argv);
            break;
        case 'update':
            await updateProject(api, argv.project, argv);
            break;
    }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

export { addProject, bulkAddProjects, updateProject }; 