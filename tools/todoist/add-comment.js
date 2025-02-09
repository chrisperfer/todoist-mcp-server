#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function addComment(query, comment, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!query) {
            console.error("Error: Task/Project ID or content is required");
            process.exit(1);
        }

        if (!comment) {
            console.error("Error: Comment content is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            let task = null;
            let project = null;

            // If --project flag is set, only search for projects
            if (options.projectMode) {
                const projects = await api.getProjects();
                project = projects.find(p => 
                    p.id === query || 
                    p.name.toLowerCase().includes(query.toLowerCase())
                );
                if (!project) {
                    console.error(`Error: No project found matching "${query}"`);
                    process.exit(1);
                }
            } else {
                // Default behavior: try task first, then project if no task found
                const tasks = await api.getTasks();
                task = tasks.find(t => 
                    t.id === query || 
                    t.content.toLowerCase().includes(query.toLowerCase())
                );

                // Only look for project if no task found
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
            }

            // Create comment using REST API
            const response = await fetch('https://api.todoist.com/rest/v2/comments', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    task_id: task ? task.id : undefined,
                    project_id: project ? project.id : undefined,
                    content: comment
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to add comment');
            }

            const result = await response.json();
            
            if (options.json) {
                console.log(JSON.stringify({
                    target: task ? {
                        type: 'task',
                        id: task.id,
                        content: task.content
                    } : {
                        type: 'project',
                        id: project.id,
                        name: project.name
                    },
                    comment: result,
                    status: 'added'
                }, null, 2));
            } else {
                if (task) {
                    console.log(`Comment added to task: ${task.content}`);
                } else {
                    console.log(`Comment added to project: ${project.name}`);
                }
                console.log(`Comment: ${comment}`);
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
    projectMode: args.includes('--project')
};

// Remove flags from args before processing query
const cleanArgs = args.filter(arg => !arg.startsWith('--'));

// Get query (everything before the last argument, which is the comment)
const query = cleanArgs.slice(0, -1).join(' ');
const comment = cleanArgs[cleanArgs.length - 1];

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    addComment(query, comment, options);
}

export { addComment }; 