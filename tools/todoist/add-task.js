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
    project: null,
    parent: null,
    priority: null,
    dueString: null,
    dueDate: null,
    labels: []
};

// Get task content (everything before the first -- flag or all args if no flags)
const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
const content = firstFlagIndex === -1 
    ? args.join(' ')
    : args.slice(0, firstFlagIndex).join(' ');

// Parse other options
let i = firstFlagIndex;
while (i !== -1 && i < args.length) {
    switch (args[i]) {
        case '--project':
            if (i + 1 < args.length) options.project = args[++i];
            break;
        case '--parent':
            if (i + 1 < args.length) options.parent = args[++i];
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
        case '--label':
            if (i + 1 < args.length) options.labels.push(args[++i]);
            break;
    }
    i++;
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    addTask(content, options);
}

export { addTask }; 