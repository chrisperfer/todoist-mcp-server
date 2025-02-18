#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function addTask(content, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!content) {
            console.error("Error: Task content is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // If project name is provided, find the project ID
            let projectId = null;
            if (options.project) {
                const projects = await api.getProjects();
                const projectPath = options.project.toLowerCase();
                
                // Function to build the full project path
                const getProjectPath = (project) => {
                    const path = [project.name];
                    let current = project;
                    const projectMap = new Map(projects.map(p => [p.id, p]));
                    
                    while (current.parentId) {
                        const parent = projectMap.get(current.parentId);
                        if (!parent) break;
                        path.unshift(parent.name);
                        current = parent;
                    }
                    
                    return path.join(' » ');
                };

                // Find project by path
                const project = projects.find(p => 
                    getProjectPath(p).toLowerCase().includes(projectPath)
                );

                if (project) {
                    projectId = project.id;
                } else {
                    console.error(`Error: Project "${options.project}" not found`);
                    process.exit(1);
                }
            }

            // If parent task is specified, find its ID
            let parentId = null;
            if (options.parent) {
                const tasks = await api.getTasks();
                const parentTask = tasks.find(t => 
                    t.id === options.parent || 
                    t.content.toLowerCase().includes(options.parent.toLowerCase())
                );

                if (parentTask) {
                    parentId = parentTask.id;
                    // If no project specified, use parent's project
                    if (!projectId) {
                        projectId = parentTask.projectId;
                    }
                } else {
                    console.error(`Error: Parent task "${options.parent}" not found`);
                    process.exit(1);
                }
            }

            // Create task object
            const taskData = {
                content: content,
                ...(projectId && { projectId }),
                ...(parentId && { parentId }),
                ...(options.priority && { priority: parseInt(options.priority) }),
                ...(options.dueString && { dueString: options.dueString }),
                ...(options.dueDate && { dueDate: options.dueDate }),
                ...(options.labels && { labels: options.labels })
            };

            // Add the task
            const task = await api.addTask(taskData);

            // Output the created task
            if (options.json) {
                console.log(JSON.stringify(task, null, 2));
            } else {
                console.log(`Task created: ${task.id}`);
                console.log(`Content: ${task.content}`);
                if (projectId) console.log(`Project ID: ${projectId}`);
                if (parentId) console.log(`Parent Task ID: ${parentId}`);
                if (task.due) console.log(`Due: ${task.due.date}${task.due.datetime ? ' ' + task.due.datetime : ''}`);
                if (task.priority) console.log(`Priority: ${task.priority}`);
                if (task.labels && task.labels.length) console.log(`Labels: @${task.labels.join(' @')}`);
                console.log(`URL: ${task.url}`);
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
    content: null,
    project: null,
    parent: null,
    priority: null,
    dueString: null,
    dueDate: null,
    labels: []
};

// Parse flags and their values
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const value = i + 1 < args.length ? args[i + 1] : null;
    if (!value || value.startsWith('--')) continue;

    switch (arg) {
        case '--content':
            options.content = value;
            i++;
            break;
        case '--project':
            options.project = value;
            i++;
            break;
        case '--parent':
            options.parent = value;
            i++;
            break;
        case '--priority':
            options.priority = value;
            i++;
            break;
        case '--due':
            options.dueString = value;
            i++;
            break;
        case '--date':
            options.dueDate = value;
            i++;
            break;
        case '--label':
            options.labels.push(value);
            i++;
            break;
    }
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    addTask(options.content, options);
}

export { addTask }; 