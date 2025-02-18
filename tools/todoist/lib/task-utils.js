#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';

export async function initializeApi() {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
        console.error("Error: TODOIST_API_TOKEN environment variable is required");
        process.exit(1);
    }
    return new TodoistApi(token);
}

export async function findTask(api, taskQuery) {
    if (!taskQuery) {
        console.error("Error: Task ID or content is required");
        process.exit(1);
    }

    const tasks = await api.getTasks();
    const task = tasks.find(t => 
        t.id === taskQuery || 
        t.content.toLowerCase().includes(taskQuery.toLowerCase())
    );

    if (!task) {
        console.error(`Error: Task "${taskQuery}" not found`);
        process.exit(1);
    }

    return task;
}

export async function getProjectPath(api, projectId) {
    if (!projectId) return "Inbox";
    
    const projects = await api.getProjects();
    const projectMap = new Map(projects.map(p => [p.id, p]));
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
}

export async function executeSyncCommand(token, command) {
    const response = await fetch('https://api.todoist.com/sync/v9/sync', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            commands: [command]
        })
    });

    const result = await response.json();
    
    if (!result.sync_status) {
        throw new Error("No sync status in response");
    }

    const commandId = Object.keys(result.sync_status)[0];
    const status = result.sync_status[commandId];
    
    if (status !== 'ok' && status !== true) {
        throw new Error(status.error || status);
    }

    return result;
}

async function executeSyncCommands(token, commands) {
    const response = await fetch('https://api.todoist.com/sync/v9/sync', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ commands })
    });

    const result = await response.json();
    
    if (!result.sync_status) {
        throw new Error("No sync status in response");
    }

    // Check all command statuses
    const errors = [];
    for (const [uuid, status] of Object.entries(result.sync_status)) {
        if (status !== 'ok' && status !== true) {
            errors.push(`Command ${uuid}: ${status.error || status}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(errors.join('\n'));
    }

    return result;
}

export function formatJsonOutput(task, status, details = {}) {
    return JSON.stringify({
        task: {
            id: task.id,
            content: task.content,
            ...details
        },
        status
    }, null, 2);
}

function parseBaseOptions(args) {
    const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
    const taskQuery = firstFlagIndex === -1 
        ? args.join(' ')
        : args.slice(0, firstFlagIndex).join(' ');

    const options = {
        json: args.includes('--json'),
        taskQuery
    };

    return { taskQuery, options, remainingArgs: args.slice(firstFlagIndex) };
}

export { parseBaseOptions, executeSyncCommands }; 