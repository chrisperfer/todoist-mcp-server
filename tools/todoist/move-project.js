#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import { randomUUID } from 'crypto';
import url from 'url';

async function moveProject(projectQuery, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        const api = new TodoistApi(token);

        try {
            if (!projectQuery) {
                console.error("Error: Project name or ID is required");
                process.exit(1);
            }

            const projects = await api.getProjects();
            
            // Function to build the full project path (reused from list-projects.js)
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

            // Find the project to move
            const project = projects.find(p => 
                p.id === projectQuery || 
                getProjectPath(p).toLowerCase().includes(projectQuery.toLowerCase())
            );

            if (!project) {
                console.error(`Error: Project "${projectQuery}" not found`);
                process.exit(1);
            }

            // Find the parent project if specified
            let parentId = null;
            if (options.parent) {
                const parent = projects.find(p => 
                    p.id !== project.id && // Prevent self-parenting
                    getProjectPath(p).toLowerCase().includes(options.parent.toLowerCase())
                );

                if (parent) {
                    parentId = parent.id;
                } else {
                    console.error(`Error: Parent project "${options.parent}" not found`);
                    process.exit(1);
                }
            }

            // Use Sync API for the move operation
            const syncResponse = await fetch('https://api.todoist.com/sync/v9/sync', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    commands: [{
                        type: 'project_move',
                        uuid: randomUUID(),
                        args: {
                            id: project.id,
                            parent_id: parentId
                        }
                    }]
                })
            });

            const result = await syncResponse.json();
            
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }

            if (result.sync_status) {
                const status = result.sync_status[Object.keys(result.sync_status)[0]];
                if (status === 'ok') {
                    console.log(`Successfully moved project "${project.name}"`);
                    if (parentId) {
                        const parent = projects.find(p => p.id === parentId);
                        console.log(`New parent: ${getProjectPath(parent)}`);
                    } else {
                        console.log("Moved to top level");
                    }
                } else {
                    console.error("Error moving project:", status);
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
    parent: null
};

// Get project query (everything before the first -- flag)
const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
const projectQuery = firstFlagIndex === -1 
    ? args.join(' ')
    : args.slice(0, firstFlagIndex).join(' ');

// Parse other options
let i = firstFlagIndex;
while (i !== -1 && i < args.length) {
    switch (args[i]) {
        case '--parent':
            if (i + 1 < args.length) {
                options.parent = args[++i];
            } else {
                options.parent = null; // Remove parent if no value provided
            }
            break;
    }
    i++;
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    moveProject(projectQuery, options);
}

export { moveProject }; 