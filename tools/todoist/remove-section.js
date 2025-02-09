#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function removeSection(sectionQuery, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!sectionQuery) {
            console.error("Error: Section name or ID is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Get sections and projects for resolving names
            const sections = await api.getSections();
            const projects = await api.getProjects();
            
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

            // Find the section to remove
            let section;
            if (options.project) {
                // If project specified, try to find it by ID first, then name, then path
                const project = projects.find(p => p.id === options.project) ||  // Try ID match
                               projects.find(p => p.name === options.project) || // Try exact name match
                               projects.find(p =>                                // Try path match
                                   getProjectPath(p).toLowerCase().includes(options.project.toLowerCase())
                               );

                if (!project) {
                    console.error(`Error: Project "${options.project}" not found`);
                    process.exit(1);
                }

                section = sections.find(s => 
                    s.projectId === project.id && 
                    s.name.toLowerCase().includes(sectionQuery.toLowerCase())
                );
            } else {
                // Otherwise try to find by ID or name across all projects
                section = sections.find(s => 
                    s.id === sectionQuery || 
                    s.name.toLowerCase().includes(sectionQuery.toLowerCase())
                );
            }

            if (!section) {
                console.error(`Error: Section "${sectionQuery}" not found`);
                process.exit(1);
            }

            // Get and store tasks in the section before deletion
            const tasks = await api.getTasks({ sectionId: section.id });
            if (tasks.length > 0 && !options.force) {
                console.error(`Warning: Section "${section.name}" contains ${tasks.length} tasks:`);
                tasks.forEach(task => console.error(`  - ${task.content} (${task.id})`));
                console.error("\nThese tasks will be moved to the project root. Use --force to proceed.");
                process.exit(1);
            }

            // Store task IDs for verification
            const taskIds = tasks.map(task => task.id);

            // Move tasks to project root before deleting section
            console.log(`Moving ${tasks.length} tasks to project root...`);
            for (const task of tasks) {
                await api.updateTask(task.id, { sectionId: null });
            }

            // Delete the section
            await api.deleteSection(section.id);

            // Verify tasks after section deletion
            const allTasks = await api.getTasks();
            const survivingTasks = allTasks.filter(task => taskIds.includes(task.id));

            if (options.json) {
                console.log(JSON.stringify({
                    id: section.id,
                    name: section.name,
                    projectPath: getProjectPath(section.projectId),
                    tasksBeforeDeletion: tasks.map(t => ({ id: t.id, content: t.content })),
                    tasksSurviving: survivingTasks.map(t => ({ 
                        id: t.id, 
                        content: t.content,
                        projectId: t.projectId,
                        sectionId: t.sectionId
                    })),
                    status: 'deleted'
                }, null, 2));
            } else {
                console.log(`Section deleted: ${section.name}`);
                console.log(`Project: ${getProjectPath(section.projectId)}`);
                console.log(`ID: ${section.id}`);
                if (tasks.length > 0) {
                    console.log(`\nTasks moved and verified: ${survivingTasks.length}/${tasks.length}`);
                    if (survivingTasks.length > 0) {
                        console.log("\nTasks now in project root:");
                        survivingTasks.forEach(task => {
                            console.log(`  - ${task.content} (${task.id})`);
                        });
                    }
                    if (survivingTasks.length !== tasks.length) {
                        console.error("\nWARNING: Some tasks could not be verified after moving!");
                    }
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
    force: args.includes('--force')
};

// Get section query (everything before the first -- flag or all args if no flags)
const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
const sectionQuery = firstFlagIndex === -1 
    ? args.join(' ')
    : args.slice(0, firstFlagIndex).join(' ');

// Parse other options
let i = firstFlagIndex;
while (i !== -1 && i < args.length) {
    switch (args[i]) {
        case '--project':
            if (i + 1 < args.length) options.project = args[++i];
            break;
    }
    i++;
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    removeSection(sectionQuery, options);
}

export { removeSection }; 