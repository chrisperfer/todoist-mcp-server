#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
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

function parseAddOptions(args) {
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

    if (!name) {
        console.error("Error: Project name is required");
        process.exit(1);
    }

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

    return { name, options };
}

function parseBulkAddOptions(args) {
    const options = {
        json: args.includes('--json'),
        parentId: null,
        color: null,
        view: null,
        favorite: args.includes('--favorite')
    };

    // First argument should be a newline-separated list of projects
    if (args.length === 0) {
        console.error("Error: Project list is required for bulk-add");
        process.exit(1);
    }

    // Split by literal \n or actual newlines and clean up
    const projects = args[0]
        .split(/\\n|\n/)
        .map(t => t.trim())
        .filter(t => t);
    args = args.slice(1);

    let i = 0;
    while (i < args.length) {
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

    return { projects, options };
}

function parseUpdateOptions(args) {
    const options = {
        json: args.includes('--json'),
        name: null,
        parentId: null,
        color: null,
        view: null,
        favorite: undefined
    };

    // Get project query (everything before the first -- flag or all args if no flags)
    const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
    const projectQuery = firstFlagIndex === -1 
        ? args.join(' ')
        : args.slice(0, firstFlagIndex).join(' ');

    if (!projectQuery) {
        console.error("Error: Project ID or name is required");
        process.exit(1);
    }

    // Parse other options
    let i = firstFlagIndex;
    while (i !== -1 && i < args.length) {
        switch (args[i]) {
            case '--name':
                if (i + 1 < args.length) options.name = args[++i];
                break;
            case '--parentId':
                if (i + 1 < args.length) options.parentId = args[++i];
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
        i++;
    }

    if (!options.name && !options.parentId && !options.color && !options.view && options.favorite === undefined) {
        console.error("Error: At least one update option is required (--name, --parentId, --color, --view, --favorite, or --no-favorite)");
        process.exit(1);
    }

    return { projectQuery, options };
}

async function main() {
    try {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.error("Error: Subcommand required (add, bulk-add, or update)");
            process.exit(1);
        }
        
        const subcommand = args[0];
        const subcommandArgs = args.slice(1);
        
        const api = await initializeApi();
        
        switch (subcommand) {
            case 'add': {
                const { name, options } = parseAddOptions(subcommandArgs);
                await addProject(api, name, options);
                break;
            }
            case 'bulk-add': {
                const { projects, options } = parseBulkAddOptions(subcommandArgs);
                await bulkAddProjects(api, projects, options);
                break;
            }
            case 'update': {
                const { projectQuery, options } = parseUpdateOptions(subcommandArgs);
                await updateProject(api, projectQuery, options);
                break;
            }
            default:
                console.error(`Error: Unknown subcommand "${subcommand}"`);
                process.exit(1);
        }
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    main();
}

export { addProject, bulkAddProjects, updateProject }; 