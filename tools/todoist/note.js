#!/usr/bin/env node

import { randomUUID } from 'crypto';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { TodoistApi } from '@doist/todoist-api-typescript';
import { executeSyncCommand, executeSyncCommands } from './lib/task-utils.js';

// Initialize API and get token
function getToken() {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
        console.error("Error: TODOIST_API_TOKEN environment variable is required");
        process.exit(1);
    }
    return token;
}

async function initializeApi() {
    return new TodoistApi(getToken());
}

// Add a note to a task or project
async function addNote(query, content, options = {}) {
    const token = getToken();
    const api = await initializeApi();
    
    if (!content) {
        console.error('Error: Note content is required');
        process.exit(1);
    }

    let task = null;
    let project = null;
    
    // If not using direct IDs, search for the task or project
    if (!options.taskId && !options.projectId) {
        try {
            // Try to find task by ID or content
            const tasks = await api.getTasks();
            task = tasks.find(t => 
                t.id === query || 
                t.content.toLowerCase().includes(query.toLowerCase())
            );
            
            // If no task found, try to find project
            if (!task) {
                const projects = await api.getProjects();
                project = projects.find(p => 
                    p.id === query || 
                    p.name.toLowerCase().includes(query.toLowerCase())
                );
            }

            if (!task && !project) {
                console.error(`Error: No task or project found matching "${query}"`);
                process.exit(1);
            }
        } catch (error) {
            console.error('Error finding task or project:', error.message);
            process.exit(1);
        }
    } else {
        // Direct ID provided
        try {
            if (options.taskId) {
                // Get task details
                try {
                    task = await api.getTask(options.taskId);
                } catch (e) {
                    // If we can't get details, just use the ID
                    task = { id: options.taskId, content: `Task ${options.taskId}` };
                }
            } else if (options.projectId) {
                // Get project details
                try {
                    project = await api.getProject(options.projectId);
                } catch (e) {
                    // If we can't get details, just use the ID
                    project = { id: options.projectId, name: `Project ${options.projectId}` };
                }
            }
        } catch (error) {
            console.error('Error retrieving details:', error.message);
            // Continue with just the ID
            if (options.taskId) {
                task = { id: options.taskId, content: `Task ${options.taskId}` };
            } else if (options.projectId) {
                project = { id: options.projectId, name: `Project ${options.projectId}` };
            }
        }
    }

    // Create note using Sync API
    const command = {
        type: 'note_add',
        temp_id: randomUUID(),
        uuid: randomUUID(),
        args: {
            content: content
        }
    };

    // Add either task_id or project_id
    if (task) {
        command.args.item_id = String(task.id);
    } else if (project) {
        command.args.project_id = String(project.id);
    }

    try {
        const result = await executeSyncCommand(token, command);
        
        const noteId = result.temp_id_mapping[command.temp_id];
        
        if (options.json) {
            console.log(JSON.stringify({
                note_id: noteId,
                content: content,
                target_type: task ? 'task' : 'project',
                target_id: task ? task.id : project.id,
                target_name: task ? task.content : project.name,
                status: 'added'
            }, null, 2));
        } else {
            console.log(`Note added to ${task ? 'task' : 'project'}: ${task ? task.content : project.name}`);
            console.log(`Note: ${content}`);
        }
        
        return { success: true, noteId };
    } catch (error) {
        console.error('Error adding note:', error.message);
        process.exit(1);
    }
}

// Add the same note to multiple tasks
async function batchAddNotes(taskIds, content, options = {}) {
    const token = getToken();
    
    if (!content) {
        console.error('Error: Note content is required');
        process.exit(1);
    }

    if (!taskIds || taskIds.length === 0) {
        console.error('Error: At least one task ID is required');
        process.exit(1);
    }

    // Create commands for each task
    const commands = taskIds.map(taskId => ({
        type: 'note_add',
        temp_id: randomUUID(),
        uuid: randomUUID(),
        args: {
            item_id: String(taskId),
            content: content
        }
    }));

    try {
        const result = await executeSyncCommands(token, commands);
        
        const results = commands.map((command, index) => {
            const noteId = result.temp_id_mapping[command.temp_id];
            return {
                task_id: taskIds[index],
                note_id: noteId,
                status: result.sync_status[command.uuid] === 'ok' ? 'added' : 'failed'
            };
        });
        
        if (options.json) {
            console.log(JSON.stringify({
                notes_added: results.filter(r => r.status === 'added').length,
                total_tasks: taskIds.length,
                results: results
            }, null, 2));
        } else {
            console.log(`Added note to ${results.filter(r => r.status === 'added').length} of ${taskIds.length} tasks`);
            console.log(`Note: ${content}`);
        }
        
        return { success: true, results };
    } catch (error) {
        console.error('Error adding notes:', error.message);
        process.exit(1);
    }
}

// Add the same note to multiple projects
async function batchAddProjectNotes(projectIds, content, options = {}) {
    const token = getToken();
    
    if (!content) {
        console.error('Error: Note content is required');
        process.exit(1);
    }

    // Debug logging
    console.error('Received projectIds:', JSON.stringify(projectIds));
    
    // Ensure projectIds is an array
    if (!Array.isArray(projectIds)) {
        if (typeof projectIds === 'string') {
            // Handle space-separated IDs
            projectIds = projectIds.split(/\s+/);
        } else {
            console.error('Error: projectIds must be an array or a string');
            process.exit(1);
        }
    }

    if (projectIds.length === 0) {
        console.error('Error: At least one project ID is required');
        process.exit(1);
    }

    // Create commands for each project
    const commands = projectIds.map(projectId => ({
        type: 'note_add',
        temp_id: randomUUID(),
        uuid: randomUUID(),
        args: {
            project_id: String(projectId),
            content: content
        }
    }));

    // Debug logging
    console.error('Commands:', JSON.stringify(commands));

    try {
        const result = await executeSyncCommands(token, commands);
        
        const results = commands.map((command, index) => {
            const noteId = result.temp_id_mapping[command.temp_id];
            return {
                project_id: projectIds[index],
                note_id: noteId,
                status: result.sync_status[command.uuid] === 'ok' ? 'added' : 'failed'
            };
        });
        
        if (options.json) {
            console.log(JSON.stringify({
                notes_added: results.filter(r => r.status === 'added').length,
                total_projects: projectIds.length,
                results: results
            }, null, 2));
        } else {
            console.log(`Added note to ${results.filter(r => r.status === 'added').length} of ${projectIds.length} projects`);
            console.log(`Note: ${content}`);
        }
        
        return { success: true, results };
    } catch (error) {
        console.error('Error adding notes:', error.message);
        process.exit(1);
    }
}

// Main CLI handler
yargs(hideBin(process.argv))
    .command('add [content]', 'Add a note to a task or project', (yargs) => {
        return yargs
            .option('taskId', {
                describe: 'Task ID to add note to',
                type: 'string'
            })
            .option('projectId', {
                describe: 'Project ID to add note to',
                type: 'string'
            })
            .option('content', {
                describe: 'Note content',
                type: 'string'
            })
            .option('json', {
                describe: 'Output in JSON format',
                type: 'boolean',
                default: false
            })
            .check((argv) => {
                if (!argv.content) {
                    throw new Error('Note content is required');
                }
                if (!argv.taskId && !argv.projectId && !argv._.length) {
                    throw new Error('You must provide either a task/project query or specific IDs');
                }
                return true;
            });
    }, async (argv) => {
        try {
            // Handle different argument patterns
            if (argv.taskId || argv.projectId) {
                // Direct ID provided
                const query = argv.taskId || argv.projectId;
                await addNote(query, argv.content, {
                    taskId: argv.taskId,
                    projectId: argv.projectId,
                    json: argv.json
                });
            } else {
                // Query provided
                const query = argv._[0];
                await addNote(query, argv.content, { json: argv.json });
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })
    .command('batch-add [content]', 'Add the same note to multiple tasks', (yargs) => {
        return yargs
            .option('taskIds', {
                describe: 'Task IDs to add note to (space-separated)',
                type: 'array',
                demandOption: true
            })
            .option('content', {
                describe: 'Note content',
                type: 'string',
                demandOption: true
            })
            .option('json', {
                describe: 'Output in JSON format',
                type: 'boolean',
                default: false
            });
    }, async (argv) => {
        try {
            await batchAddNotes(argv.taskIds, argv.content, { json: argv.json });
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })
    .command('batch-add-project [content]', 'Add the same note to multiple projects', (yargs) => {
        return yargs
            .option('projectIds', {
                describe: 'Project IDs to add note to (space-separated)',
                type: 'array',
                demandOption: true
            })
            .option('content', {
                describe: 'Note content',
                type: 'string',
                demandOption: true
            })
            .option('json', {
                describe: 'Output in JSON format',
                type: 'boolean',
                default: false
            });
    }, async (argv) => {
        try {
            await batchAddProjectNotes(argv.projectIds, argv.content, { json: argv.json });
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })
    .demandCommand(1, 'You must specify a command')
    .strict()
    .help()
    .argv; 