#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import { randomUUID } from 'crypto';
import url from 'url';

async function moveTask(taskQuery, options = {}) {
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
            // Get tasks, projects and sections
            const tasks = await api.getTasks();
            const projects = await api.getProjects();
            const sections = await api.getSections();
            
            // Function to build the full project path
            const getProjectPath = (projectId) => {
                if (!projectId) return "Inbox";
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
            };

            // Find the task to move
            const task = tasks.find(t => 
                t.id === taskQuery || 
                t.content.toLowerCase().includes(taskQuery.toLowerCase())
            );

            if (!task) {
                console.error(`Error: Task "${taskQuery}" not found`);
                process.exit(1);
            }

            // Find target project if specified
            let projectId = task.projectId;
            if (options.project) {
                const project = projects.find(p => 
                    p.id === options.project ||
                    p.name === options.project ||
                    getProjectPath(p).toLowerCase().includes(options.project.toLowerCase())
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

            // Create and execute move command
            const command = {
                type: 'item_move',
                uuid: randomUUID(),
                args: {
                    id: task.id,
                    ...targetId
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
                        content: task.content
                    },
                    from: {
                        project: getProjectPath(task.projectId),
                        section: task.sectionId
                    },
                    to: {
                        project: getProjectPath(projectId),
                        section: targetId.section_id
                    },
                    status: result.sync_status ? 'moved' : 'error'
                }, null, 2));
            } else {
                if (result.sync_status) {
                    const commandId = Object.keys(result.sync_status)[0];
                    const status = result.sync_status[commandId];
                    
                    if (status === 'ok' || status === true) {
                        console.log(`Task moved: ${task.content}`);
                        if (projectId !== task.projectId) {
                            console.log(`From project: ${getProjectPath(task.projectId)}`);
                            console.log(`To project: ${getProjectPath(projectId)}`);
                        }
                        if (targetId.section_id !== task.sectionId) {
                            const fromSection = sections.find(s => s.id === task.sectionId);
                            const toSection = sections.find(s => s.id === targetId.section_id);
                            console.log(`From section: ${fromSection ? fromSection.name : 'none'}`);
                            console.log(`To section: ${toSection ? toSection.name : 'none'}`);
                        }
                    } else {
                        console.error("Error moving task:", status.error || status);
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
    project: null,
    section: undefined,
    parent: undefined
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

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    moveTask(taskQuery, options);
}

export { moveTask }; 