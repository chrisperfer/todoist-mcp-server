#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import {
    initializeApi,
    findTask,
    getProjectPath,
    executeSyncCommand,
    executeSyncCommands,
    formatJsonOutput,
    parseBaseOptions
} from './lib/task-utils.js';
import {
    resolveTaskId,
    resolveProjectId,
    resolveSectionId
} from './lib/id-utils.js';

async function moveTask(api, task, options) {
    let targetId;
    let projectId;

    switch (options.destination) {
        case 'parent':
            try {
                const parentId = await resolveTaskId(api, options.id);
                targetId = { parent_id: parentId };
                // Parent task's project is implied
                const parentTask = (await api.getTasks()).find(t => t.id === parentId);
                if (parentTask) projectId = parentTask.projectId;
            } catch (error) {
                console.error(`Error: Parent task "${options.id}" not found`);
                process.exit(1);
            }
            break;

        case 'section':
            try {
                targetId = { section_id: options.id };
                // Section's project is implied - we'll get it from the task data
                const sections = await api.getSections();
                const section = sections.find(s => s.id === options.id.toString());  // Convert to string for comparison
                if (!section) {
                    throw new Error(`Section not found: ${options.id}`);
                }
                projectId = section.projectId;
            } catch (error) {
                console.error(`Error moving task to section "${options.id}"`);
                process.exit(1);
            }
            break;

        case 'project':
            try {
                projectId = await resolveProjectId(api, options.id);
                targetId = { project_id: projectId };
            } catch (error) {
                console.error(`Error: Project "${options.id}" not found`);
                process.exit(1);
            }
            break;
    }

    const command = {
        type: 'item_move',
        uuid: randomUUID(),
        args: {
            id: task.id,
            ...targetId
        }
    };

    const result = await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    if (options.json) {
        console.log(formatJsonOutput(task, 'moved', {
            from: {
                project: await getProjectPath(api, task.projectId),
                section: task.sectionId
            },
            to: {
                project: await getProjectPath(api, projectId),
                section: targetId.section_id,
                parent: targetId.parent_id
            }
        }));
    } else {
        console.log(`Task moved: ${task.content}`);
        if (projectId !== task.projectId) {
            console.log(`From project: ${await getProjectPath(api, task.projectId)}`);
            console.log(`To project: ${await getProjectPath(api, projectId)}`);
        }
        if (targetId.section_id) {
            const sections = await api.getSections();
            const toSection = sections.find(s => s.id === targetId.section_id);
            console.log(`To section: ${toSection ? toSection.name : 'unknown'}`);
        }
        if (targetId.parent_id) {
            const parentTask = (await api.getTasks()).find(t => t.id === targetId.parent_id);
            console.log(`To parent: ${parentTask ? parentTask.content : targetId.parent_id}`);
        }
    }
}

async function updateTask(api, task, options) {
    if (options.complete) {
        try {
            await api.closeTask(task.id);
            console.log(`Task completed: ${task.content}`);
            return;
        } catch (error) {
            console.error("Error completing task:", error.message);
            process.exit(1);
        }
    }

    const updateData = {};

    // Handle labels/tags
    if (options.labels) {
        const existingLabels = task.labels || [];
        
        if (options.addLabels) {
            updateData.labels = [...new Set([...existingLabels, ...options.labels.split(',').map(l => l.trim())])];
        } else if (options.removeLabels) {
            updateData.labels = existingLabels.filter(l => !options.labels.split(',').map(l => l.trim()).includes(l));
        } else {
            updateData.labels = options.labels.split(',').map(l => l.trim());
        }
    }

    // Handle other updates
    if (options.content) updateData.content = options.content;
    if (options.description) updateData.description = options.description;
    if (options.priority) updateData.priority = parseInt(options.priority);
    if (options.dueString) updateData.due_string = options.dueString;
    if (options.dueDate) updateData.due_date = options.dueDate;

    const command = {
        type: 'item_update',
        uuid: randomUUID(),
        args: {
            id: task.id,
            ...updateData
        }
    };

    const result = await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    if (options.json) {
        console.log(formatJsonOutput(task, 'updated', {
            labels: updateData.labels || task.labels,
            updates: updateData
        }));
    } else {
        console.log(`Task updated: ${task.content}`);
        if (updateData.labels) {
            console.log(`Labels: ${updateData.labels.join(', ') || 'none'}`);
        }
        if (updateData.content) {
            console.log(`New content: ${updateData.content}`);
        }
        if (updateData.priority) {
            console.log(`New priority: ${updateData.priority}`);
        }
        if (updateData.due_string || updateData.due_date) {
            console.log(`New due date: ${updateData.due_string || updateData.due_date}`);
        }
    }
}

function parseMoveOptions(args) {
    const options = {
        destination: null,
        id: null
    };

    // First collect all destination flags
    const destinationFlags = args.filter(arg => 
        arg === '--to-project' || 
        arg === '--to-section' || 
        arg === '--to-parent'
    );

    if (destinationFlags.length === 0) {
        console.error("Error: Must specify a destination with one of: --to-project ID, --to-section ID, --to-parent ID");
        process.exit(1);
    }

    if (destinationFlags.length > 1) {
        console.error(`Error: Cannot specify multiple destinations. Found: ${destinationFlags.join(', ')}`);
        console.error("Use only one of: --to-project, --to-section, --to-parent");
        process.exit(1);
    }

    // Now we know we have exactly one destination flag
    const destinationFlag = destinationFlags[0];
    const flagIndex = args.indexOf(destinationFlag);
    
    if (flagIndex === -1 || flagIndex === args.length - 1) {
        console.error(`Error: ${destinationFlag} requires an ID`);
        process.exit(1);
    }

    options.destination = destinationFlag.replace('--to-', '');
    options.id = args[flagIndex + 1];

    return options;
}

function parseUpdateOptions(args) {
    const options = {
        complete: args.includes('--complete'),
        labels: null,
        addLabels: false,
        removeLabels: false,
        content: null,
        description: null,
        priority: null,
        dueString: null,
        dueDate: null
    };

    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case '--labels':
                if (i + 1 < args.length) options.labels = args[++i];
                break;
            case '--add-labels':
                if (i + 1 < args.length) {
                    options.labels = args[++i];
                    options.addLabels = true;
                }
                break;
            case '--remove-labels':
                if (i + 1 < args.length) {
                    options.labels = args[++i];
                    options.removeLabels = true;
                }
                break;
            case '--content':
                if (i + 1 < args.length) options.content = args[++i];
                break;
            case '--description':
                if (i + 1 < args.length) options.description = args[++i];
                break;
            case '--priority':
                if (i + 1 < args.length) options.priority = args[++i];
                break;
            case '--due-string':
                if (i + 1 < args.length) options.dueString = args[++i];
                break;
            case '--due-date':
                if (i + 1 < args.length) options.dueDate = args[++i];
                break;
        }
        i++;
    }

    return options;
}

function parseAddOptions(args) {
    const options = {
        destination: null,
        id: null,
        priority: null,
        dueString: null,
        dueDate: null,
        labels: null
    };

    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case '--to-project':
            case '--to-parent':
            case '--to-section':
                if (options.destination) {
                    console.error("Error: Cannot specify multiple destinations. Use only one of: --to-project, --to-parent, --to-section");
                    process.exit(1);
                }
                options.destination = args[i].replace('--to-', '');
                if (i + 1 < args.length) options.id = args[++i];
                break;
            case '--priority':
                if (i + 1 < args.length) options.priority = args[++i];
                break;
            case '--due':
                if (i + 1 < args.length) options.dueString = args[++i];
                break;
            case '--date':
                if (i + 1 < args.length) options.dueDate = args[++i];
                break;
            case '--labels':
                if (i + 1 < args.length) options.labels = args[++i];
                break;
        }
        i++;
    }

    return options;
}

async function addTask(api, content, options = {}) {
    let projectId = null;
    let parentId = null;
    let sectionId = null;

    if (options.destination) {
        switch (options.destination) {
            case 'parent':
                try {
                    parentId = await resolveTaskId(api, options.id);
                    // Parent task's project is implied
                    const parentTask = (await api.getTasks()).find(t => t.id === parentId);
                    if (parentTask) projectId = parentTask.projectId;
                } catch (error) {
                    console.error(`Error: Parent task "${options.id}" not found`);
                    process.exit(1);
                }
                break;

            case 'project':
                try {
                    projectId = await resolveProjectId(api, options.id);
                } catch (error) {
                    console.error(`Error: Project "${options.id}" not found`);
                    process.exit(1);
                }
                break;

            case 'section':
                try {
                    sectionId = await resolveSectionId(api, options.id);
                    const sections = await api.getSections();
                    const section = sections.find(s => s.id === sectionId.toString());
                    if (!section) {
                        throw new Error(`Section not found: ${options.id}`);
                    }
                    projectId = section.projectId;
                } catch (error) {
                    console.error(`Error: Section "${options.id}" not found`);
                    process.exit(1);
                }
                break;
        }
    }

    // Create task object
    const taskData = {
        content: content,
        ...(projectId && { project_id: projectId.toString() }),
        ...(parentId && { parent_id: parentId.toString() }),
        ...(sectionId && { section_id: sectionId.toString() }),
        ...(options.priority && { priority: parseInt(options.priority) }),
        ...(options.dueString && { date_string: options.dueString }),
        ...(options.dueDate && { date: options.dueDate }),
        ...(options.labels && { labels: options.labels.split(',').map(l => l.trim()) })
    };

    // Add the task
    const task = await api.addTask(taskData);

    if (options.json) {
        console.log(formatJsonOutput(task, 'created', {
            project: projectId,
            parent: parentId,
            due: task.due,
            priority: task.priority,
            labels: task.labels
        }));
    } else {
        console.log(`Task created: ${task.id}`);
        console.log(`Content: ${task.content}`);
        if (projectId) {
            const projectPath = await getProjectPath(api, projectId);
            console.log(`Project: ${projectPath}`);
        }
        if (parentId) console.log(`Parent Task: ${parentId}`);
        if (task.due) console.log(`Due: ${task.due.date}${task.due.datetime ? ' ' + task.due.datetime : ''}`);
        if (task.priority) console.log(`Priority: ${task.priority}`);
        if (task.labels && task.labels.length) console.log(`Labels: @${task.labels.join(' @')}`);
        console.log(`URL: ${task.url}`);
    }
}

function parseBatchMoveOptions(args) {
    const options = {
        destination: null,
        id: null,
        filter: null
    };

    // First argument is the filter if it doesn't start with --
    if (args.length > 0 && !args[0].startsWith('--')) {
        options.filter = args[0];
        args = args.slice(1); // Remove filter from args for destination parsing
    }

    if (!options.filter) {
        console.error("Error: Filter is required for batch operations");
        process.exit(1);
    }

    // Collect all destination flags
    const destinationFlags = args.filter(arg => 
        arg === '--to-project' || 
        arg === '--to-section' || 
        arg === '--to-parent'
    );

    if (destinationFlags.length === 0) {
        console.error("Error: Must specify a destination with one of: --to-project ID, --to-section ID, --to-parent ID");
        process.exit(1);
    }

    if (destinationFlags.length > 1) {
        console.error(`Error: Cannot specify multiple destinations. Found: ${destinationFlags.join(', ')}`);
        console.error("Use only one of: --to-project, --to-section, --to-parent");
        process.exit(1);
    }

    // Now we know we have exactly one destination flag
    const destinationFlag = destinationFlags[0];
    const flagIndex = args.indexOf(destinationFlag);
    
    if (flagIndex === -1 || flagIndex === args.length - 1) {
        console.error(`Error: ${destinationFlag} requires an ID`);
        process.exit(1);
    }

    options.destination = destinationFlag.replace('--to-', '');
    options.id = args[flagIndex + 1];

    return options;
}

async function batchMoveTask(api, filter, options) {
    // Get tasks matching the filter
    const tasks = await api.getTasks({ filter });
    if (tasks.length === 0) {
        console.error(`No tasks found matching filter: ${filter}`);
        process.exit(1);
    }

    let targetId;
    let projectId;

    switch (options.destination) {
        case 'parent':
            try {
                const parentId = await resolveTaskId(api, options.id);
                targetId = { parent_id: parentId };
                // Parent task's project is implied
                const parentTask = (await api.getTasks()).find(t => t.id === parentId);
                if (parentTask) projectId = parentTask.projectId;
            } catch (error) {
                console.error(`Error: Parent task "${options.id}" not found`);
                process.exit(1);
            }
            break;

        case 'section':
            try {
                targetId = { section_id: options.id };
                // Section's project is implied - we'll get it from the task data
                const task = tasks ? tasks[0] : await api.getTask(task.id);
                if (task) projectId = task.projectId;
            } catch (error) {
                console.error(`Error moving task to section "${options.id}"`);
                process.exit(1);
            }
            break;

        case 'project':
            try {
                projectId = await resolveProjectId(api, options.id);
                targetId = { project_id: projectId };
            } catch (error) {
                console.error(`Error: Project "${options.id}" not found`);
                process.exit(1);
            }
            break;
    }

    // Build commands for each task
    const commands = tasks.map(task => ({
        type: 'item_move',
        uuid: randomUUID(),
        args: {
            id: task.id,
            ...targetId
        }
    }));

    // Execute all commands in one request
    const result = await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    if (options.json) {
        console.log(JSON.stringify({
            tasks: tasks.map(task => ({
                id: task.id,
                content: task.content,
                from: {
                    project: task.projectId,
                    section: task.sectionId,
                    parent: task.parentId
                },
                to: {
                    project: projectId,
                    section: targetId.section_id,
                    parent: targetId.parent_id
                }
            })),
            status: 'moved',
            commandCount: commands.length
        }, null, 2));
    } else {
        console.log(`Moved ${tasks.length} tasks:`);
        for (const task of tasks) {
            console.log(`- ${task.content} (${task.id})`);
            if (projectId && projectId !== task.projectId) {
                const fromPath = await getProjectPath(api, task.projectId);
                const toPath = await getProjectPath(api, projectId);
                console.log(`  From project: ${fromPath}`);
                console.log(`  To project: ${toPath}`);
            }
            if (targetId.section_id) {
                const sections = await api.getSections();
                const section = sections.find(s => s.id === targetId.section_id);
                console.log(`  To section: ${section ? section.name : 'unknown'}`);
            }
            if (targetId.parent_id) {
                const parentTask = tasks.find(t => t.id === targetId.parent_id);
                console.log(`  To parent: ${parentTask ? parentTask.content : targetId.parent_id}`);
            }
        }
    }
}

function parseBatchLabelOptions(args) {
    const options = {
        filter: null,
        labels: null,
        addLabels: false,
        removeLabels: false
    };

    // First argument is the filter if it doesn't start with --
    if (args.length > 0 && !args[0].startsWith('--')) {
        options.filter = args[0];
        args = args.slice(1); // Remove filter from args for label parsing
    }

    if (!options.filter) {
        console.error("Error: Filter is required for batch operations");
        process.exit(1);
    }

    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case '--labels':
                if (i + 1 < args.length) options.labels = args[++i];
                break;
            case '--add-labels':
                if (i + 1 < args.length) {
                    options.labels = args[++i];
                    options.addLabels = true;
                }
                break;
            case '--remove-labels':
                if (i + 1 < args.length) {
                    options.labels = args[++i];
                    options.removeLabels = true;
                }
                break;
        }
        i++;
    }

    if (!options.labels) {
        console.error("Error: Must specify labels with one of: --labels, --add-labels, or --remove-labels");
        process.exit(1);
    }

    return options;
}

async function batchLabelTask(api, filter, options) {
    // Get tasks matching the filter
    const tasks = await api.getTasks({ filter });
    if (tasks.length === 0) {
        console.error(`No tasks found matching filter: ${filter}`);
        process.exit(1);
    }

    // Build commands for each task
    const commands = tasks.map(task => {
        const existingLabels = task.labels || [];
        let newLabels;

        if (options.addLabels) {
            newLabels = [...new Set([...existingLabels, ...options.labels.split(',').map(l => l.trim())])];
        } else if (options.removeLabels) {
            newLabels = existingLabels.filter(l => !options.labels.split(',').map(l => l.trim()).includes(l));
        } else {
            newLabels = options.labels.split(',').map(l => l.trim());
        }

        return {
            type: 'item_update',
            uuid: randomUUID(),
            args: {
                id: task.id,
                labels: newLabels
            }
        };
    });

    // Execute all commands in one request
    const result = await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    if (options.json) {
        console.log(JSON.stringify({
            tasks: tasks.map(task => ({
                id: task.id,
                content: task.content,
                oldLabels: task.labels || [],
                newLabels: commands.find(c => c.args.id === task.id).args.labels
            })),
            status: 'updated',
            commandCount: commands.length
        }, null, 2));
    } else {
        console.log(`Updated labels for ${tasks.length} tasks:`);
        for (const task of tasks) {
            const command = commands.find(c => c.args.id === task.id);
            console.log(`- ${task.content} (${task.id})`);
            console.log(`  From: ${task.labels?.join(', ') || 'none'}`);
            console.log(`  To: ${command.args.labels.join(', ') || 'none'}`);
        }
    }
}

function parseBatchAddOptions(args) {
    const options = {
        tasks: [],
        destination: null,
        id: null,
        priority: null,
        dueString: null,
        dueDate: null,
        labels: null
    };

    // First argument should be a newline-separated list of tasks
    if (args.length === 0) {
        console.error("Error: Task list is required for batch-add");
        process.exit(1);
    }

    // Split by literal \n or actual newlines and clean up
    options.tasks = args[0]
        .split(/\\n|\n/)
        .map(t => t.trim())
        .filter(t => t);
    args = args.slice(1);

    // Collect destination flags
    const destinationFlags = args.filter(arg => 
        arg === '--to-project' || 
        arg === '--to-section' || 
        arg === '--to-parent'
    );

    if (destinationFlags.length > 1) {
        console.error(`Error: Cannot specify multiple destinations. Found: ${destinationFlags.join(', ')}`);
        console.error("Use only one of: --to-project, --to-section, --to-parent");
        process.exit(1);
    }

    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case '--to-project':
            case '--to-section':
            case '--to-parent':
                if (i + 1 < args.length) {
                    options.destination = args[i].replace('--to-', '');
                    options.id = args[++i];
                }
                break;
            case '--priority':
                if (i + 1 < args.length) options.priority = args[++i];
                break;
            case '--due-string':
                if (i + 1 < args.length) options.dueString = args[++i];
                break;
            case '--due-date':
                if (i + 1 < args.length) options.dueDate = args[++i];
                break;
            case '--labels':
                if (i + 1 < args.length) options.labels = args[++i];
                break;
        }
        i++;
    }

    return options;
}

async function batchAddTask(api, options) {
    let projectId = null;
    let parentId = null;
    let sectionId = null;

    // Resolve destination
    if (options.destination) {
        switch (options.destination) {
            case 'parent':
                try {
                    parentId = await resolveTaskId(api, options.id);
                    // Parent task's project is implied
                    const parentTask = (await api.getTasks()).find(t => t.id === parentId);
                    if (parentTask) projectId = parentTask.projectId;
                } catch (error) {
                    console.error(`Error: Parent task "${options.id}" not found`);
                    process.exit(1);
                }
                break;

            case 'section':
                try {
                    sectionId = await resolveSectionId(api, options.id);
                    // Get section's project
                    const sections = await api.getSections();
                    const section = sections.find(s => s.id === sectionId);
                    if (section) projectId = section.projectId;
                } catch (error) {
                    console.error(`Error: Section "${options.id}" not found`);
                    process.exit(1);
                }
                break;

            case 'project':
                try {
                    projectId = await resolveProjectId(api, options.id);
                } catch (error) {
                    console.error(`Error: Project "${options.id}" not found`);
                    process.exit(1);
                }
                break;
        }
    }

    // Create commands for each task
    const commands = options.tasks.map(content => {
        const taskData = {
            content,
            ...(projectId && { project_id: projectId.toString() }),
            ...(parentId && { parent_id: parentId.toString() }),
            ...(sectionId && { section_id: sectionId.toString() }),
            ...(options.priority && { priority: parseInt(options.priority) }),
            ...(options.dueString && { date_string: options.dueString }),
            ...(options.dueDate && { date: options.dueDate }),
            ...(options.labels && { labels: options.labels.split(',').map(l => l.trim()) })
        };

        return {
            type: 'item_add',
            temp_id: randomUUID(),
            uuid: randomUUID(),
            args: taskData
        };
    });

    // Execute all commands in one request
    const result = await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    // Get the created tasks
    const createdTasks = await api.getTasks();
    const justCreatedTasks = createdTasks.filter(task => 
        options.tasks.includes(task.content) && 
        (!projectId || task.projectId === projectId) &&
        (!parentId || task.parentId === parentId) &&
        (!sectionId || task.sectionId === sectionId)
    );

    if (options.json) {
        console.log(JSON.stringify({
            tasks: justCreatedTasks,
            destination: {
                type: options.destination,
                id: options.id,
                project: projectId,
                section: sectionId,
                parent: parentId
            },
            status: 'added',
            count: justCreatedTasks.length
        }, null, 2));
    } else {
        console.log(`Added ${justCreatedTasks.length} tasks:`);
        for (const task of justCreatedTasks) {
            console.log(`- ${task.content} (${task.id})`);
        }
        if (projectId) {
            const projectPath = await getProjectPath(api, projectId);
            console.log(`To project: ${projectPath}`);
        }
        if (sectionId) {
            const sections = await api.getSections();
            const section = sections.find(s => s.id === sectionId);
            console.log(`To section: ${section ? section.name : 'unknown'}`);
        }
        if (parentId) {
            const parentTask = (await api.getTasks()).find(t => t.id === parentId);
            console.log(`Under parent: ${parentTask ? parentTask.content : parentId}`);
        }
        if (options.priority) console.log(`Priority: ${options.priority}`);
        if (options.dueString || options.dueDate) console.log(`Due: ${options.dueString || options.dueDate}`);
        if (options.labels) console.log(`Labels: ${options.labels}`);
    }
}

async function main() {
    try {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.error("Error: Subcommand required (add, batch-add, update, move, batch-move, batch-label, or complete)");
            process.exit(1);
        }
        
        const subcommand = args[0];
        const subcommandArgs = args.slice(1);
        
        const api = await initializeApi();
        
        switch (subcommand) {
            case 'add':
                if (subcommandArgs.length === 0) {
                    console.error("Error: Task content is required");
                    process.exit(1);
                }
                const content = subcommandArgs[0];
                const addOptions = parseAddOptions(subcommandArgs.slice(1));
                await addTask(api, content, { ...addOptions, json: args.includes('--json') });
                break;
            case 'batch-add':
                if (subcommandArgs.length === 0) {
                    console.error("Error: Task list is required");
                    process.exit(1);
                }
                const batchAddOptions = parseBatchAddOptions(subcommandArgs);
                await batchAddTask(api, { ...batchAddOptions, json: args.includes('--json') });
                break;
            case 'move':
                const { taskQuery, options: baseOptions, remainingArgs } = parseBaseOptions(subcommandArgs);
                const task = await findTask(api, taskQuery);
                await moveTask(api, task, { ...baseOptions, ...parseMoveOptions(remainingArgs) });
                break;
            case 'update':
            case 'complete':
                const { taskQuery: updateTaskQuery, options: updateBaseOptions, remainingArgs: updateRemainingArgs } = parseBaseOptions(subcommandArgs);
                const updateTask = await findTask(api, updateTaskQuery);
                const updateOptions = parseUpdateOptions(updateRemainingArgs);
                if (subcommand === 'complete') {
                    updateOptions.complete = true;
                }
                await updateTask(api, updateTask, { ...updateBaseOptions, ...updateOptions });
                break;
            case 'batch-move':
                const batchMoveOptions = parseBatchMoveOptions(subcommandArgs);
                if (!batchMoveOptions.filter) {
                    console.error("Error: Filter is required for batch operations");
                    process.exit(1);
                }
                if (!batchMoveOptions.destination || !batchMoveOptions.id) {
                    console.error("Error: Must specify a destination with one of: --to-project ID, --to-section ID, --to-parent ID");
                    process.exit(1);
                }
                await batchMoveTask(api, batchMoveOptions.filter, { ...batchMoveOptions, json: args.includes('--json') });
                break;
            case 'batch-label':
                const batchLabelOptions = parseBatchLabelOptions(subcommandArgs);
                await batchLabelTask(api, batchLabelOptions.filter, { ...batchLabelOptions, json: args.includes('--json') });
                break;
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

export { moveTask, updateTask, addTask }; 