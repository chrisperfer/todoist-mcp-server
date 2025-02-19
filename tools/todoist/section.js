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
    resolveProjectId,
    resolveSectionId,
    searchSections,
    formatSectionList
} from './lib/id-utils.js';

async function addSection(api, name, options) {
    let projectId;
    try {
        projectId = await resolveProjectId(api, options.project);
    } catch (error) {
        console.error(`Error: Project "${options.project}" not found`);
        process.exit(1);
    }

    const command = {
        type: 'section_add',
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
            name,
            project_id: projectId,
            ...(options.order !== undefined && { order: parseInt(options.order) })
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Get the newly created section
    const sections = await api.getSections();
    const newSection = sections.find(s => 
        s.name === name && 
        s.projectId === projectId
    );

    if (options.json) {
        console.log(formatJsonOutput(newSection, 'created', {
            project: await getProjectPath(api, projectId)
        }));
    } else {
        console.log(`Section created: ${newSection.id}`);
        console.log(`Name: ${newSection.name}`);
        console.log(`Project: ${await getProjectPath(api, projectId)}`);
        if (newSection.order) console.log(`Order: ${newSection.order}`);
    }
}

async function bulkAddSections(api, sections, options) {
    let projectId;
    try {
        projectId = await resolveProjectId(api, options.project);
    } catch (error) {
        console.error(`Error: Project "${options.project}" not found`);
        process.exit(1);
    }

    // Create commands for each section
    const commands = sections.map((name, index) => ({
        type: 'section_add',
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
            name,
            project_id: projectId,
            ...(options.startOrder !== undefined && { 
                order: parseInt(options.startOrder) + index 
            })
        }
    }));

    await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    // Get the newly created sections
    const allSections = await api.getSections();
    const newSections = allSections.filter(s => 
        sections.includes(s.name) && 
        s.projectId === projectId
    );

    if (options.json) {
        console.log(JSON.stringify({
            sections: await Promise.all(newSections.map(async section => ({
                ...section,
                projectPath: await getProjectPath(api, projectId)
            }))),
            status: 'created',
            count: newSections.length
        }, null, 2));
    } else {
        console.log(`Added ${newSections.length} sections to ${await getProjectPath(api, projectId)}:`);
        for (const section of newSections) {
            console.log(`- ${section.name} (${section.id})`);
            if (section.order) console.log(`  Order: ${section.order}`);
        }
    }
}

async function updateSection(api, sectionQuery, options) {
    let section;
    try {
        const sectionId = await resolveSectionId(api, sectionQuery);
        const sections = await api.getSections();
        section = sections.find(s => s.id === sectionId);
    } catch (error) {
        console.error(`Error: Section "${sectionQuery}" not found`);
        process.exit(1);
    }

    const updateData = {};
    if (options.name) updateData.name = options.name;
    if (options.order !== undefined) updateData.order = parseInt(options.order);

    // If moving to a different project
    if (options.project) {
        try {
            updateData.project_id = await resolveProjectId(api, options.project);
        } catch (error) {
            console.error(`Error: Project "${options.project}" not found`);
            process.exit(1);
        }
    }

    const command = {
        type: 'section_update',
        uuid: randomUUID(),
        args: {
            id: section.id,
            ...updateData
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Get the updated section
    const updatedSections = await api.getSections();
    const updatedSection = updatedSections.find(s => s.id === section.id);

    if (options.json) {
        console.log(formatJsonOutput(updatedSection, 'updated', {
            originalProject: await getProjectPath(api, section.projectId),
            newProject: updateData.project_id ? 
                await getProjectPath(api, updateData.project_id) : 
                undefined
        }));
    } else {
        console.log(`Section updated: ${updatedSection.name}`);
        console.log(`ID: ${updatedSection.id}`);
        if (updateData.project_id) {
            console.log(`From project: ${await getProjectPath(api, section.projectId)}`);
            console.log(`To project: ${await getProjectPath(api, updateData.project_id)}`);
        } else {
            console.log(`Project: ${await getProjectPath(api, updatedSection.projectId)}`);
        }
        if (updateData.order !== undefined) console.log(`New order: ${updateData.order}`);
    }
}

async function removeSection(api, sectionQuery, options) {
    let section;
    try {
        const sectionId = await resolveSectionId(api, sectionQuery);
        const sections = await api.getSections();
        section = sections.find(s => s.id === sectionId);
    } catch (error) {
        console.error(`Error: Section "${sectionQuery}" not found`);
        process.exit(1);
    }

    // Get tasks in the section before deletion
    const tasks = await api.getTasks({ sectionId: section.id });
    if (tasks.length > 0 && !options.force) {
        console.error(`Warning: Section "${section.name}" contains ${tasks.length} tasks:`);
        tasks.forEach(task => console.error(`  - ${task.content} (${task.id})`));
        console.error("\nThese tasks will be moved to the project root. Use --force to proceed.");
        process.exit(1);
    }

    // Move tasks to project root before deleting section
    if (tasks.length > 0) {
        console.log(`Moving ${tasks.length} tasks from section "${section.name}" to project root...`);
        const moveCommands = tasks.map(task => ({
            type: 'item_move',
            uuid: randomUUID(),
            args: {
                id: task.id.toString(),
                project_id: section.projectId.toString()  // Move to the section's project root
            }
        }));
        await executeSyncCommands(process.env.TODOIST_API_TOKEN, moveCommands);

        // Wait a moment for the move to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify tasks were moved successfully
        const movedTasks = await api.getTasks({ projectId: section.projectId });
        const taskIds = tasks.map(t => t.id);
        const survivingTasks = movedTasks.filter(task => taskIds.includes(task.id));
        
        if (survivingTasks.length !== tasks.length) {
            console.error("Error: Not all tasks were successfully moved to project root");
            process.exit(1);
        }
    }

    // Delete the section
    const command = {
        type: 'section_delete',
        uuid: randomUUID(),
        args: {
            id: section.id
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Final verification of tasks
    const allTasks = await api.getTasks();
    const taskIds = tasks.map(t => t.id);
    const survivingTasks = allTasks.filter(task => taskIds.includes(task.id));

    if (options.json) {
        console.log(JSON.stringify({
            id: section.id,
            name: section.name,
            projectPath: await getProjectPath(api, section.projectId),
            tasksBeforeDeletion: tasks.map(t => ({ id: t.id, content: t.content })),
            tasksSurviving: survivingTasks.map(t => ({ 
                id: t.id, 
                content: t.content,
                projectId: t.projectId,
                sectionId: t.sectionId
            })),
            status: 'deleted'
        }, null, 2));
    } else {
        console.log(`Section deleted: ${section.name}`);
        console.log(`Project: ${await getProjectPath(api, section.projectId)}`);
        console.log(`ID: ${section.id}`);
        if (tasks.length > 0) {
            console.log(`\nTasks moved and verified: ${survivingTasks.length}/${tasks.length}`);
            if (survivingTasks.length > 0) {
                console.log("\nTasks now in project root:");
                survivingTasks.forEach(task => {
                    console.log(`  - ${task.content} (${task.id})`);
                });
            }
            if (survivingTasks.length !== tasks.length) {
                console.error("\nWARNING: Some tasks could not be verified after moving!");
            }
        }
    }
}

async function bulkRemoveSections(api, sectionQueries, options) {
    const sections = [];
    const allSections = await api.getSections();
    
    // Resolve all section queries first
    for (const query of sectionQueries) {
        const numericId = parseInt(query.trim());
        if (!isNaN(numericId)) {
            const section = allSections.find(s => s.id === numericId.toString());  // Convert to string for comparison
            if (section) {
                sections.push(section);
                continue;
            }
        }
        
        // If not a numeric ID, try to find by name
        const matchingSection = allSections.find(s => 
            s.name.toLowerCase() === query.trim().toLowerCase()
        );
        
        if (matchingSection) {
            sections.push(matchingSection);
        } else if (options.continueOnError) {
            console.error(`Warning: Section "${query}" not found, skipping...`);
        } else {
            console.error(`Error: Section "${query}" not found`);
            process.exit(1);
        }
    }

    if (sections.length === 0) {
        console.error("Error: No valid sections found to remove");
        process.exit(1);
    }

    // Get all tasks in these sections
    const tasksBySection = new Map();
    for (const section of sections) {
        const tasks = await api.getTasks({ sectionId: section.id });
        tasksBySection.set(section.id, tasks);
    }

    // Check if any sections have tasks and force isn't enabled
    if (!options.force) {
        let hasTasksToMove = false;
        for (const [sectionId, tasks] of tasksBySection.entries()) {
            if (tasks.length > 0) {
                const section = sections.find(s => s.id === sectionId);
                console.error(`Warning: Section "${section.name}" contains ${tasks.length} tasks:`);
                tasks.forEach(task => console.error(`  - ${task.content} (${task.id})`));
                hasTasksToMove = true;
            }
        }
        if (hasTasksToMove) {
            console.error("\nThese tasks will be moved to their respective project roots. Use --force to proceed.");
            process.exit(1);
        }
    }

    // Move all tasks to their project roots first
    const moveCommands = [];
    for (const [sectionId, tasks] of tasksBySection.entries()) {
        if (tasks.length > 0) {
            const section = sections.find(s => s.id === sectionId);
            console.log(`Moving ${tasks.length} tasks from section "${section.name}" to project root...`);
            moveCommands.push(...tasks.map(task => ({
                type: 'item_move',
                uuid: randomUUID(),
                args: {
                    id: task.id.toString(),
                    project_id: section.projectId.toString()  // Move to the section's project root
                }
            })));
        }
    }

    if (moveCommands.length > 0) {
        await executeSyncCommands(process.env.TODOIST_API_TOKEN, moveCommands);
    }

    // Delete all sections
    const deleteCommands = sections.map(section => ({
        type: 'section_delete',
        uuid: randomUUID(),
        args: {
            id: section.id
        }
    }));

    await executeSyncCommands(process.env.TODOIST_API_TOKEN, deleteCommands);

    // Verify tasks after deletion
    const allTasks = await api.getTasks();
    const taskVerification = new Map();
    
    for (const [sectionId, originalTasks] of tasksBySection.entries()) {
        const taskIds = originalTasks.map(t => t.id);
        const survivingTasks = allTasks.filter(task => taskIds.includes(task.id));
        taskVerification.set(sectionId, {
            original: originalTasks,
            surviving: survivingTasks
        });
    }

    if (options.json) {
        console.log(JSON.stringify({
            sections: await Promise.all(sections.map(async section => ({
                id: section.id,
                name: section.name,
                projectPath: await getProjectPath(api, section.projectId),
                tasksBeforeDeletion: tasksBySection.get(section.id).map(t => ({ 
                    id: t.id, 
                    content: t.content 
                })),
                tasksSurviving: taskVerification.get(section.id).surviving.map(t => ({ 
                    id: t.id, 
                    content: t.content,
                    projectId: t.projectId,
                    sectionId: t.sectionId
                }))
            }))),
            status: 'deleted',
            count: sections.length
        }, null, 2));
    } else {
        console.log(`\nRemoved ${sections.length} sections:`);
        for (const section of sections) {
            console.log(`\nSection: ${section.name}`);
            console.log(`ID: ${section.id}`);
            console.log(`Project: ${await getProjectPath(api, section.projectId)}`);
            
            const verification = taskVerification.get(section.id);
            if (verification.original.length > 0) {
                console.log(`Tasks moved and verified: ${verification.surviving.length}/${verification.original.length}`);
                if (verification.surviving.length > 0) {
                    console.log("Tasks now in project root:");
                    verification.surviving.forEach(task => {
                        console.log(`  - ${task.content} (${task.id})`);
                    });
                }
                if (verification.surviving.length !== verification.original.length) {
                    console.error("WARNING: Some tasks could not be verified after moving!");
                }
            }
        }
    }
}

function parseAddOptions(args) {
    const options = {
        json: args.includes('--json'),
        project: null,
        order: undefined
    };

    // Get section name (everything before the first -- flag or all args if no flags)
    const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
    const name = firstFlagIndex === -1 
        ? args.join(' ')
        : args.slice(0, firstFlagIndex).join(' ');

    if (!name) {
        console.error("Error: Section name is required");
        process.exit(1);
    }

    // Parse other options
    let i = firstFlagIndex;
    while (i !== -1 && i < args.length) {
        switch (args[i]) {
            case '--project':
                if (i + 1 < args.length) options.project = args[++i];
                break;
            case '--order':
                if (i + 1 < args.length) options.order = parseInt(args[++i], 10);
                break;
        }
        i++;
    }

    if (!options.project) {
        console.error("Error: Project is required (use --project)");
        process.exit(1);
    }

    return { name, options };
}

function parseBulkAddOptions(args) {
    const options = {
        json: args.includes('--json'),
        project: null,
        startOrder: undefined
    };

    // First argument should be a newline-separated list of sections
    if (args.length === 0) {
        console.error("Error: Section list is required for bulk-add");
        process.exit(1);
    }

    // Split by literal \n or actual newlines and clean up
    const sections = args[0]
        .split(/\\n|\n/)
        .map(t => t.trim())
        .filter(t => t);
    args = args.slice(1);

    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case '--project':
                if (i + 1 < args.length) options.project = args[++i];
                break;
            case '--start-order':
                if (i + 1 < args.length) options.startOrder = parseInt(args[++i], 10);
                break;
        }
        i++;
    }

    if (!options.project) {
        console.error("Error: Project is required (use --project)");
        process.exit(1);
    }

    return { sections, options };
}

function parseUpdateOptions(args) {
    const options = {
        json: args.includes('--json'),
        name: null,
        project: null,
        order: undefined
    };

    // Get section query (everything before the first -- flag or all args if no flags)
    const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
    const sectionQuery = firstFlagIndex === -1 
        ? args.join(' ')
        : args.slice(0, firstFlagIndex).join(' ');

    if (!sectionQuery) {
        console.error("Error: Section ID or name is required");
        process.exit(1);
    }

    // Parse other options
    let i = firstFlagIndex;
    while (i !== -1 && i < args.length) {
        switch (args[i]) {
            case '--name':
                if (i + 1 < args.length) options.name = args[++i];
                break;
            case '--project':
                if (i + 1 < args.length) options.project = args[++i];
                break;
            case '--order':
                if (i + 1 < args.length) options.order = parseInt(args[++i], 10);
                break;
        }
        i++;
    }

    if (!options.name && !options.project && options.order === undefined) {
        console.error("Error: At least one update option is required (--name, --project, or --order)");
        process.exit(1);
    }

    return { sectionQuery, options };
}

function parseRemoveOptions(args) {
    const options = {
        json: args.includes('--json'),
        force: args.includes('--force')
    };

    // Get section query (everything before the first -- flag or all args if no flags)
    const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
    const sectionQuery = firstFlagIndex === -1 
        ? args.join(' ')
        : args.slice(0, firstFlagIndex).join(' ');

    if (!sectionQuery) {
        console.error("Error: Section ID or name is required");
        process.exit(1);
    }

    return { sectionQuery, options };
}

function parseBulkRemoveOptions(args) {
    const options = {
        json: args.includes('--json'),
        force: args.includes('--force'),
        continueOnError: args.includes('--continue-on-error')
    };

    // Get section queries (everything before the first -- flag or all args if no flags)
    const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
    let sectionList;
    
    if (firstFlagIndex === -1) {
        sectionList = args.join(' ');
    } else {
        // Join with spaces and then split by commas to handle quoted strings with spaces
        sectionList = args.slice(0, firstFlagIndex).join(' ');
    }

    if (!sectionList) {
        console.error("Error: Section list is required (comma-separated IDs or names)");
        process.exit(1);
    }

    // Split by commas, but preserve spaces around emojis
    const sectionQueries = sectionList
        .split(/\s*,\s*/)
        .map(s => s.trim())
        .filter(s => s);

    if (sectionQueries.length === 0) {
        console.error("Error: No valid sections specified");
        process.exit(1);
    }

    return { sectionQueries, options };
}

async function main() {
    try {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.error("Error: Subcommand required (add, bulk-add, update, remove, or bulk-remove)");
            process.exit(1);
        }
        
        const subcommand = args[0];
        const subcommandArgs = args.slice(1);
        
        const api = await initializeApi();
        
        switch (subcommand) {
            case 'add': {
                const { name, options } = parseAddOptions(subcommandArgs);
                await addSection(api, name, options);
                break;
            }
            case 'bulk-add': {
                const { sections, options } = parseBulkAddOptions(subcommandArgs);
                await bulkAddSections(api, sections, options);
                break;
            }
            case 'update': {
                const { sectionQuery, options } = parseUpdateOptions(subcommandArgs);
                await updateSection(api, sectionQuery, options);
                break;
            }
            case 'remove': {
                const { sectionQuery, options } = parseRemoveOptions(subcommandArgs);
                await removeSection(api, sectionQuery, options);
                break;
            }
            case 'bulk-remove': {
                const { sectionQueries, options } = parseBulkRemoveOptions(subcommandArgs);
                await bulkRemoveSections(api, sectionQueries, options);
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

export { addSection, bulkAddSections, updateSection, removeSection, bulkRemoveSections }; 