#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import { randomUUID } from 'crypto';
import url from 'url';

async function updateTask(taskQuery, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!taskQuery) {
            console.error("Error: Task ID or content is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Get tasks and labels
            const tasks = await api.getTasks();
            const labels = await api.getLabels();
            
            // Find the task to update
            const task = tasks.find(t => 
                t.id === taskQuery || 
                t.content.toLowerCase().includes(taskQuery.toLowerCase())
            );

            if (!task) {
                console.error(`Error: Task "${taskQuery}" not found`);
                process.exit(1);
            }

            // Prepare update data
            const updateData = {};

            // Handle labels/tags
            if (options.labels) {
                // Convert label names to IDs and validate they exist
                const labelNames = options.labels.split(',').map(l => l.trim());
                const existingLabels = task.labels || [];
                
                // If adding labels (--add-labels)
                if (options.addLabels) {
                    updateData.labels = [...new Set([...existingLabels, ...labelNames])];
                }
                // If removing labels (--remove-labels)
                else if (options.removeLabels) {
                    updateData.labels = existingLabels.filter(l => !labelNames.includes(l));
                }
                // If setting labels (--labels)
                else {
                    updateData.labels = labelNames;
                }
            }

            // Handle other updates
            if (options.content) updateData.content = options.content;
            if (options.description) updateData.description = options.description;
            if (options.priority) updateData.priority = parseInt(options.priority);
            if (options.dueString) updateData.due_string = options.dueString;
            if (options.dueDate) updateData.due_date = options.dueDate;

            // Create and execute update command
            const command = {
                type: 'item_update',
                uuid: randomUUID(),
                args: {
                    id: task.id,
                    ...updateData
                }
            };

            const syncResponse = await fetch('https://api.todoist.com/sync/v9/sync', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    commands: [command]
                })
            });

            const result = await syncResponse.json();
            
            if (options.json) {
                console.log(JSON.stringify({
                    task: {
                        id: task.id,
                        content: task.content,
                        labels: updateData.labels || task.labels
                    },
                    status: result.sync_status ? 'updated' : 'error'
                }, null, 2));
            } else {
                if (result.sync_status) {
                    const commandId = Object.keys(result.sync_status)[0];
                    const status = result.sync_status[commandId];
                    
                    if (status === 'ok' || status === true) {
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
                    } else {
                        console.error("Error updating task:", status.error || status);
                        process.exit(1);
                    }
                } else {
                    console.error("Error: No sync status in response");
                    process.exit(1);
                }
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
    labels: null,
    addLabels: false,
    removeLabels: false,
    content: null,
    description: null,
    priority: null,
    dueString: null,
    dueDate: null
};

// Get task query (everything before the first -- flag)
const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
const taskQuery = firstFlagIndex === -1 
    ? args.join(' ')
    : args.slice(0, firstFlagIndex).join(' ');

// Parse other options
let i = firstFlagIndex;
while (i !== -1 && i < args.length) {
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

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    updateTask(taskQuery, options);
}

export { updateTask }; 