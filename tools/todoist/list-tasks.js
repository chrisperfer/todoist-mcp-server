#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function listTasks(options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);
        
        try {
            // Get all active tasks
            const tasks = await api.getTasks();
            
            if (tasks.length === 0) {
                console.log("No tasks found");
                return;
            }

            // Get projects for resolving project names
            const projects = await api.getProjects();
            const projectMap = new Map(projects.map(p => [p.id, p]));

            // Function to build the full project path
            const getProjectPath = (projectId) => {
                if (!projectId) return "Inbox";
                const project = projectMap.get(projectId);
                if (!project) return "Unknown Project";

                const path = [project.name];
                let current = project;
                
                while (current.parentId) {
                    const parent = projectMap.get(current.parentId);
                    if (!parent) break;
                    path.unshift(parent.name);
                    current = parent;
                }
                
                return path.join(' » ');
            };

            // Filter tasks by project if specified
            let filteredTasks = tasks;
            if (options.project) {
                const projectFilter = options.project.toLowerCase();
                filteredTasks = tasks.filter(task => {
                    const projectPath = getProjectPath(task.projectId).toLowerCase();
                    return projectPath.includes(projectFilter);
                });

                if (filteredTasks.length === 0) {
                    console.log(`No tasks found in projects matching "${options.project}"`);
                    return;
                }
            }

            // Filter tasks by labels if specified
            if (options.labels && options.labels.length > 0) {
                filteredTasks = filteredTasks.filter(task => {
                    // Convert task labels to lowercase for case-insensitive comparison
                    const taskLabels = new Set((task.labels || []).map(label => 
                        label.toLowerCase().replace(/^goals:\s*/i, '')  // Remove 'goals:' prefix if present
                    ));
                    // Check if task has all specified labels
                    return options.labels.every(label => 
                        taskLabels.has(label.toLowerCase())
                    );
                });

                if (filteredTasks.length === 0) {
                    console.log(`No tasks found with labels: @${options.labels.join(', @')}`);
                    return;
                }
            }

            // Sort tasks by project and due date
            filteredTasks.sort((a, b) => {
                const projectCompare = (a.projectId || "").localeCompare(b.projectId || "");
                if (projectCompare !== 0) return projectCompare;
                
                if (!a.due && !b.due) return 0;
                if (!a.due) return 1;
                if (!b.due) return -1;
                return a.due.date.localeCompare(b.due.date);
            });

            if (options.json) {
                // Add project path and format labels to each task
                const tasksWithProject = filteredTasks.map(task => ({
                    ...task,
                    projectPath: getProjectPath(task.projectId),
                    labels: task.labels || []  // Ensure labels is always an array
                }));
                console.log(JSON.stringify(tasksWithProject, null, 2));
                return;
            }

            if (options.detailed) {
                filteredTasks.forEach(task => {
                    console.log(`Task: ${task.content}`);
                    console.log(`  ID: ${task.id}`);
                    console.log(`  Project: ${getProjectPath(task.projectId)}`);
                    if (task.due) console.log(`  Due: ${task.due.date}${task.due.datetime ? ' ' + task.due.datetime : ''}`);
                    if (task.priority) console.log(`  Priority: ${task.priority}`);
                    if (task.labels && task.labels.length) console.log(`  Labels: @${task.labels.join(', @')}`);
                    if (task.description) console.log(`  Description: ${task.description}`);
                    console.log(`  URL: ${task.url}`);
                    console.log(''); // Empty line between tasks
                });
                return;
            }

            // Default output: task info with priority, deadline, due date, project and labels
            filteredTasks.forEach(task => {
                let details = [];
                
                // Add priority if it exists (p4 is highest, p1 is lowest)
                if (task.priority > 1) {
                    details.push(`p${task.priority}`);
                }
                
                // Add due date and time if they exist
                if (task.due) {
                    if (task.due.datetime) {
                        // If there's a specific time, show date and time
                        details.push(`due ${task.due.datetime}`);
                    } else {
                        // If it's just a date, show that
                        details.push(`due ${task.due.date}`);
                    }
                }

                // Add project name
                const projectPath = getProjectPath(task.projectId);
                details.push(`[${projectPath}]`);

                // Add labels if they exist
                if (task.labels && task.labels.length > 0) {
                    details.push(`@${task.labels.join(' @')}`);
                }

                // Combine all details
                const detailsStr = details.length > 0 ? ` (${details.join(', ')})` : '';
                
                console.log(`${task.id}\t${task.content}${detailsStr}`);
            });

        } catch (apiError) {
            console.error("API Error Details:", {
                message: apiError.message,
                name: apiError.name,
                stack: apiError.stack,
                response: apiError.response ? {
                    data: apiError.response.data,
                    status: apiError.response.status,
                    headers: apiError.response.headers
                } : 'No response object'
            });
            throw apiError;
        }
    } catch (error) {
        console.error("Error in script:", error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const options = {
    json: process.argv.includes('--json'),
    detailed: process.argv.includes('--detailed'),
    project: null,
    labels: []
};

// Get project filter if specified
const projectIndex = process.argv.indexOf('--project');
if (projectIndex !== -1 && projectIndex + 1 < process.argv.length) {
    options.project = process.argv[projectIndex + 1];
}

// Get all label filters
let labelIndex = process.argv.indexOf('--label');
while (labelIndex !== -1) {
    if (labelIndex + 1 < process.argv.length) {
        options.labels.push(process.argv[labelIndex + 1]);
    }
    labelIndex = process.argv.indexOf('--label', labelIndex + 1);
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    listTasks(options);
}

export { listTasks }; 