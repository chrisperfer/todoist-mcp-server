#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import {
    initializeApi,
    findTask,
    getProjectPath,
    executeSyncCommand,
    formatJsonOutput,
    parseBaseOptions
} from './lib/task-utils.js';

async function moveTask(api, task, options) {
    const projects = await api.getProjects();
    const sections = await api.getSections();

    // Find target project if specified
    let projectId = task.projectId;
    if (options.project) {
        const project = projects.find(p => 
            p.id === options.project ||
            p.name === options.project ||
            p.name.toLowerCase().includes(options.project.toLowerCase())
        );

        if (!project) {
            console.error(`Error: Project "${options.project}" not found`);
            process.exit(1);
        }
        projectId = project.id;
    }

    // Find target project and section or parent task
    let targetId;
    if (options.parent !== undefined) {
        if (options.parent === null) {
            targetId = { project_id: projectId };
        } else {
            const tasks = await api.getTasks();
            const parentTask = tasks.find(t => 
                t.id === options.parent || 
                t.content.toLowerCase().includes(options.parent.toLowerCase())
            );

            if (!parentTask) {
                console.error(`Error: Parent task "${options.parent}" not found`);
                process.exit(1);
            }
            targetId = { parent_id: parentTask.id };
        }
    } else if (options.section !== undefined) {
        if (options.section === null) {
            targetId = { project_id: projectId };
        } else {
            const section = sections.find(s => 
                (!options.project || s.projectId === projectId) && (
                    s.id === options.section ||
                    s.name.toLowerCase().includes(options.section.toLowerCase())
                )
            );

            if (!section) {
                console.error(`Error: Section "${options.section}" not found${options.project ? ' in target project' : ''}`);
                process.exit(1);
            }
            targetId = { section_id: section.id };
        }
    } else if (options.project) {
        targetId = { project_id: projectId };
    } else {
        console.error("Error: Must specify either project, section, or parent task");
        process.exit(1);
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
                section: targetId.section_id
            }
        }));
    } else {
        console.log(`Task moved: ${task.content}`);
        if (projectId !== task.projectId) {
            console.log(`From project: ${await getProjectPath(api, task.projectId)}`);
            console.log(`To project: ${await getProjectPath(api, projectId)}`);
        }
        if (targetId.section_id !== task.sectionId) {
            const fromSection = sections.find(s => s.id === task.sectionId);
            const toSection = sections.find(s => s.id === targetId.section_id);
            console.log(`From section: ${fromSection ? fromSection.name : 'none'}`);
            console.log(`To section: ${toSection ? toSection.name : 'none'}`);
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
        project: null,
        section: undefined,
        parent: undefined
    };

    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case '--project':
                if (i + 1 < args.length) options.project = args[++i];
                break;
            case '--section':
                if (i + 1 < args.length) options.section = args[++i];
                break;
            case '--no-section':
                options.section = null;
                break;
            case '--parent':
                if (i + 1 < args.length) options.parent = args[++i];
                break;
            case '--no-parent':
                options.parent = null;
                break;
        }
        i++;
    }

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

async function main() {
    try {
        const args = process.argv.slice(2);
        
        // Get subcommand
        if (args.length === 0) {
            console.error("Error: Subcommand required (update, move, or complete)");
            process.exit(1);
        }
        
        const subcommand = args[0];
        const subcommandArgs = args.slice(1);
        
        // Parse base options
        const { taskQuery, options: baseOptions, remainingArgs } = parseBaseOptions(subcommandArgs);
        
        // Initialize API and find task
        const api = await initializeApi();
        const task = await findTask(api, taskQuery);
        
        // Execute subcommand
        switch (subcommand) {
            case 'move':
                await moveTask(api, task, { ...baseOptions, ...parseMoveOptions(remainingArgs) });
                break;
            case 'update':
            case 'complete':
                const updateOptions = parseUpdateOptions(remainingArgs);
                if (subcommand === 'complete') {
                    updateOptions.complete = true;
                }
                await updateTask(api, task, { ...baseOptions, ...updateOptions });
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

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    main();
}

export { moveTask, updateTask }; 