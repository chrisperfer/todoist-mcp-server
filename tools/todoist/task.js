#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
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

// Reuse existing task manipulation functions
async function moveTask(api, task, options) {
    let targetId;
    let projectId;

    switch (options.destination) {
        case 'parent':
            try {
                const parentId = await resolveTaskId(api, options.id);
                targetId = { parent_id: parentId };
                const parentTask = (await api.getTasks()).find(t => t.id === parentId);
                if (parentTask) projectId = parentTask.projectId;
            } catch (error) {
                console.error(`Error: Parent task "${options.id}" not found`);
                process.exit(1);
            }
            break;

        case 'section':
            try {
                // NOTE: Section validation is skipped due to REST API limitations
                // This would be the ideal validation code:
                /*
                const sections = await api.getSections();
                const section = sections.find(s => s.id === options.id);
                if (!section) {
                    throw new Error(`Section not found: ${options.id}`);
                }
                */
                // Instead, we trust the section ID and proceed
                targetId = { section_id: options.id };
                const sections = await api.getSections();
                const section = sections.find(s => s.id === options.id);
                if (section) {
                    projectId = section.projectId;
                }
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

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

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

async function batchMoveTask(api, taskIds, options) {
    // Get all tasks first
    const tasks = await api.getTasks();
    
    // Handle comma-separated IDs and convert to array
    const idArray = Array.isArray(taskIds) ? taskIds : taskIds.split(',');
    
    // Find tasks by ID
    const tasksToMove = idArray.map(id => {
        const task = tasks.find(t => t.id === id);
        if (!task) {
            console.error(`Task not found: ${id}`);
            process.exit(1);
        }
        return task;
    });

    console.log(`Moving ${tasksToMove.length} tasks`);

    // Determine target based on options
    let targetId;
    let projectId;

    switch (options.destination) {
        case 'parent':
            try {
                const parentId = await resolveTaskId(api, options.id);
                targetId = { parent_id: parentId };
                const parentTask = tasks.find(t => t.id === parentId);
                if (parentTask) projectId = parentTask.projectId;
            } catch (error) {
                console.error(`Error: Parent task "${options.id}" not found`);
                process.exit(1);
            }
            break;

        case 'section':
            try {
                targetId = { section_id: options.id };
                const sections = await api.getSections();
                const section = sections.find(s => s.id === options.id);
                if (section) {
                    projectId = section.projectId;
                }
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

    // Create move commands for all tasks
    const commands = tasksToMove.map(task => ({
        type: 'item_move',
        uuid: randomUUID(),
        args: {
            id: task.id,
            ...targetId
        }
    }));

    // Execute all move commands in a single batch
    await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    // Output results
    if (options.json) {
        console.log(formatJsonOutput(tasksToMove, 'moved', {
            from: await Promise.all(tasksToMove.map(async task => ({
                project: await getProjectPath(api, task.projectId),
                section: task.sectionId
            }))),
            to: {
                project: projectId ? await getProjectPath(api, projectId) : undefined,
                section: targetId.section_id,
                parent: targetId.parent_id
            }
        }));
    } else {
        for (const task of tasksToMove) {
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
                const parentTask = tasks.find(t => t.id === targetId.parent_id);
                console.log(`To parent: ${parentTask ? parentTask.content : targetId.parent_id}`);
            }
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
            updateData.labels = [...new Set([...existingLabels, ...options.labels])];
        } else if (options.removeLabels) {
            updateData.labels = existingLabels.filter(l => !options.labels.includes(l));
        } else {
            updateData.labels = options.labels;
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

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

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

async function addTask(api, content, options = {}) {
    let projectId = null;
    let sectionId = null;
    let parentId = null;

    // First resolve section if specified, as we might need its project ID
    if (options.sectionId) {
        try {
            sectionId = await resolveSectionId(api, options.sectionId);
            // Get the section's project ID
            const sections = await api.getSections();
            const section = sections.find(s => s.id === sectionId);
            if (section) {
                projectId = section.projectId;
            }
        } catch (error) {
            console.error(`Error: Section "${options.sectionId}" not found`);
            process.exit(1);
        }
    }

    // If projectId wasn't set from section and was provided explicitly
    if (!projectId && options.projectId) {
        try {
            projectId = await resolveProjectId(api, options.projectId);
        } catch (error) {
            console.error(`Error: Project "${options.projectId}" not found`);
            process.exit(1);
        }
    }

    if (options.parentId) {
        try {
            parentId = await resolveTaskId(api, options.parentId);
            // If we don't have a project ID yet, get it from the parent task
            if (!projectId) {
                const parentTask = (await api.getTasks()).find(t => t.id === parentId);
                if (parentTask) {
                    projectId = parentTask.projectId;
                }
            }
        } catch (error) {
            console.error(`Error: Parent task "${options.parentId}" not found`);
            process.exit(1);
        }
    }

    const command = {
        type: 'item_add',
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
            content,
            ...(projectId && { project_id: projectId }),
            ...(sectionId && { section_id: sectionId }),
            ...(parentId && { parent_id: parentId }),
            ...(options.priority && { priority: parseInt(options.priority) }),
            ...(options.dueString && { due_string: options.dueString }),
            ...(options.dueDate && { due_date: options.dueDate }),
            ...(options.labels && { labels: options.labels })
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Get the newly created task
    const tasks = await api.getTasks();
    const newTask = tasks.find(t => 
        t.content === content && 
        (!projectId || t.projectId === projectId.toString()) &&
        (!sectionId || t.sectionId === sectionId.toString()) &&
        (!parentId || t.parentId === parentId.toString())
    );

    // Get project path for output
    const projectPath = projectId ? await getProjectPath(api, projectId) : 'Inbox';

    if (options.json) {
        console.log(formatJsonOutput(newTask, 'created', {
            location: {
                project: projectPath,
                section: sectionId ? (await api.getSections()).find(s => s.id === sectionId)?.name : null,
                parent: parentId ? tasks.find(t => t.id === parentId)?.content : null
            }
        }));
    } else {
        console.log(`Task created: ${content}`);
        // Always show location information
        console.log(`Project: ${projectPath}`);
        if (sectionId) {
            const sections = await api.getSections();
            const section = sections.find(s => s.id === sectionId);
            console.log(`Section: ${section ? section.name : sectionId}`);
        }
        if (parentId) {
            const parentTask = tasks.find(t => t.id === parentId);
            console.log(`Parent: ${parentTask ? parentTask.content : parentId}`);
        }
        if (options.priority) console.log(`Priority: ${options.priority}`);
        if (options.labels) console.log(`Labels: ${options.labels.join(', ')}`);
    }
}

async function batchUpdateTask(api, taskIds, options) {
    // Get all tasks first
    const tasks = await api.getTasks();
    
    // Find tasks by ID
    const tasksToUpdate = taskIds.map(id => {
        const task = tasks.find(t => t.id === id);
        if (!task) {
            console.error(`Task not found: ${id}`);
            process.exit(1);
        }
        return task;
    });

    console.log(`Updating ${tasksToUpdate.length} tasks`);

    // Create update commands for all tasks
    const commands = tasksToUpdate.map(task => {
        const updateData = {};

        // Handle labels/tags
        if (options.labels) {
            const existingLabels = task.labels || [];
            
            if (options.addLabels) {
                updateData.labels = [...new Set([...existingLabels, ...options.labels])];
            } else if (options.removeLabels) {
                updateData.labels = existingLabels.filter(l => !options.labels.includes(l));
            } else {
                updateData.labels = options.labels;
            }
        }

        // Handle other updates
        if (options.content) updateData.content = options.content;
        if (options.description) updateData.description = options.description;
        if (options.priority) updateData.priority = parseInt(options.priority);
        if (options.dueString) updateData.due_string = options.dueString;
        if (options.dueDate) updateData.due_date = options.dueDate;

        return {
            type: options.complete ? 'item_close' : 'item_update',
            uuid: randomUUID(),
            args: options.complete ? { id: task.id } : { id: task.id, ...updateData }
        };
    });

    // Execute all update commands in a single batch
    await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    // Output results
    if (options.json) {
        console.log(formatJsonOutput(tasksToUpdate, options.complete ? 'completed' : 'updated', {
            updates: commands.map(cmd => cmd.args)
        }));
    } else {
        for (const task of tasksToUpdate) {
            if (options.complete) {
                console.log(`Task completed: ${task.content}`);
            } else {
                console.log(`Task updated: ${task.content}`);
                if (options.labels) {
                    const labels = options.addLabels ? 
                        [...new Set([...task.labels, ...options.labels])] :
                        options.removeLabels ?
                            task.labels.filter(l => !options.labels.includes(l)) :
                            options.labels;
                    console.log(`Labels: ${labels.join(', ') || 'none'}`);
                }
                if (options.content) {
                    console.log(`New content: ${options.content}`);
                }
                if (options.priority) {
                    console.log(`New priority: ${options.priority}`);
                }
                if (options.dueString || options.dueDate) {
                    console.log(`New due date: ${options.dueString || options.dueDate}`);
                }
            }
        }
    }
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .command('batch-move', 'Move multiple tasks by ID', (yargs) => {
            return yargs
                .options({
                    taskIds: {
                        description: 'Task IDs to move (comma-separated)',
                        type: 'array',
                        string: true,
                        demandOption: true,
                        coerce: arg => typeof arg === 'string' ? arg.split(',').map(s => s.trim()) : arg
                    },
                    'to-project-id': {
                        description: 'Target project ID to move tasks to',
                        type: 'string',
                        conflicts: ['to-section-id', 'to-parent-id']
                    },
                    'to-section-id': {
                        description: 'Target section ID to move tasks to',
                        type: 'string',
                        conflicts: ['to-project-id', 'to-parent-id']
                    },
                    'to-parent-id': {
                        description: 'Target parent task ID to move tasks under',
                        type: 'string',
                        conflicts: ['to-project-id', 'to-section-id']
                    },
                    json: {
                        description: 'Output in JSON format',
                        type: 'boolean',
                        default: false
                    }
                })
                .example('task.js batch-move --taskIds 12345,67890 --to-section-id 183758533',
                    'Move multiple tasks to a section')
                .example('find.js "p:FLOOBY & @work" --ids | xargs task.js batch-move --taskIds --to-project-id 2349336695',
                    'Move all work-labeled tasks from FLOOBY')
                .example('find.js "overdue" --ids | xargs task.js batch-move --taskIds --to-section-id 183758533',
                    'Move all overdue tasks to a section');
        })
        .command('batch-update', 'Update multiple tasks', (yargs) => {
            return yargs
                .options({
                    taskIds: {
                        description: 'Task IDs to update',
                        type: 'array',
                        string: true,
                        demandOption: true,
                        coerce: arg => typeof arg === 'string' ? arg.split(',').map(s => s.trim()) : arg
                    },
                    content: {
                        description: 'New task content',
                        type: 'string'
                    },
                    description: {
                        description: 'New task description',
                        type: 'string'
                    },
                    priority: {
                        description: 'New priority (1-4)',
                        type: 'number',
                        choices: [1, 2, 3, 4]
                    },
                    'due-string': {
                        description: 'New due date as string (e.g., "tomorrow", "next week")',
                        type: 'string'
                    },
                    'due-date': {
                        description: 'New due date (YYYY-MM-DD)',
                        type: 'string'
                    },
                    labels: {
                        description: 'Set labels (comma-separated)',
                        type: 'array',
                        string: true,
                        coerce: arg => typeof arg === 'string' ? arg.split(',').map(s => s.trim()) : arg
                    },
                    'add-labels': {
                        description: 'Add labels to existing ones (comma-separated)',
                        type: 'array',
                        string: true,
                        coerce: arg => typeof arg === 'string' ? arg.split(',').map(s => s.trim()) : arg
                    },
                    'remove-labels': {
                        description: 'Remove labels (comma-separated)',
                        type: 'array',
                        string: true,
                        coerce: arg => typeof arg === 'string' ? arg.split(',').map(s => s.trim()) : arg
                    },
                    complete: {
                        description: 'Mark tasks as complete',
                        type: 'boolean',
                        default: false
                    },
                    json: {
                        description: 'Output in JSON format',
                        type: 'boolean',
                        default: false
                    }
                })
                .example('task.js batch-update --taskIds 12345,67890 --content "Updated task name" --priority 1',
                    'Update content and priority for multiple tasks')
                .example('find.js "overdue" --ids | xargs task.js batch-update --taskIds --priority 1',
                    'Set priority for all overdue tasks')
                .example('find.js "p:FLOOBY & @test" --ids | xargs task.js batch-update --taskIds --labels "work,urgent"',
                    'Update labels for all test tasks in FLOOBY')
                .example('find.js "no date" --ids | xargs task.js batch-update --taskIds --due-string "tomorrow"',
                    'Set due date for all tasks without one')
                .example('find.js "completed" --ids | xargs task.js batch-update --taskIds --complete',
                    'Mark multiple tasks as complete');
        })
        .command('batch-add', 'Add multiple tasks', (yargs) => {
            return yargs
                .options({
                    tasks: {
                        description: 'Task contents (use quotes for multi-word tasks)',
                        type: 'array',
                        string: true,
                        demandOption: true
                    },
                    projectId: {
                        description: 'Project ID to add tasks to',
                        type: 'string'
                    },
                    sectionId: {
                        description: 'Section ID to add tasks to',
                        type: 'string'
                    },
                    parentId: {
                        description: 'Parent task ID to add tasks under',
                        type: 'string'
                    },
                    priority: {
                        description: 'Priority (1-4)',
                        type: 'number',
                        choices: [1, 2, 3, 4]
                    },
                    'due-string': {
                        description: 'Due date as string (e.g., "tomorrow", "next week")',
                        type: 'string'
                    },
                    'due-date': {
                        description: 'Due date (YYYY-MM-DD)',
                        type: 'string'
                    },
                    labels: {
                        description: 'Labels (comma-separated)',
                        type: 'array',
                        string: true,
                        coerce: arg => typeof arg === 'string' ? arg.split(',').map(s => s.trim()) : arg
                    },
                    json: {
                        description: 'Output in JSON format',
                        type: 'boolean',
                        default: false
                    }
                })
                .example('task.js batch-add --tasks "Task 1" "Task 2" "Task 3" --projectId 2349336695 --priority 3',
                    'Add multiple tasks to a project')
                .example('task.js batch-add --tasks "Section Task 1" "Section Task 2" --sectionId 183758533 --labels "work"',
                    'Add tasks to a section with labels')
                .example('task.js batch-add --tasks "Subtask 1" "Subtask 2" --parentId 8903766822 --due-string "tomorrow"',
                    'Add subtasks with due date');
        })
        .demandCommand(1, 'You must provide a valid command')
        .help()
        .argv;

    const api = await initializeApi();

    switch (argv._[0]) {
        case 'batch-move': {
            let destination, id;
            if (argv.toProjectId) {
                destination = 'project';
                id = argv.toProjectId;
            } else if (argv.toSectionId) {
                destination = 'section';
                id = argv.toSectionId;
            } else if (argv.toParentId) {
                destination = 'parent';
                id = argv.toParentId;
            } else {
                console.error('Must specify one of: --to-project-id, --to-section-id, --to-parent-id');
                process.exit(1);
            }

            await batchMoveTask(api, argv.taskIds, { destination, id, json: argv.json });
            break;
        }

        case 'batch-update': {
            await batchUpdateTask(api, argv.taskIds, {
                content: argv.content,
                description: argv.description,
                priority: argv.priority,
                dueString: argv.dueString,
                dueDate: argv.dueDate,
                labels: argv.labels || argv.addLabels || argv.removeLabels,
                addLabels: Boolean(argv.addLabels),
                removeLabels: Boolean(argv.removeLabels),
                complete: argv.complete,
                json: argv.json
            });
            break;
        }

        case 'batch-add': {
            for (const content of argv.tasks) {
                await addTask(api, content, {
                    projectId: argv.projectId,
                    sectionId: argv.sectionId,
                    parentId: argv.parentId,
                    priority: argv.priority,
                    dueString: argv.dueString,
                    dueDate: argv.dueDate,
                    labels: argv.labels,
                    json: argv.json
                });
            }
            break;
        }
    }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

export { batchMoveTask, batchUpdateTask, addTask }; 