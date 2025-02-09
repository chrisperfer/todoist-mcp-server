#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function listProjects(options = {}) {
    try {
        console.error("Debug: Starting list-projects");
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        console.error("Debug: Initializing API with token length:", token.length);
        
        const api = new TodoistApi(token);
        
        try {
            console.error("Debug: Calling api.getProjects()");
            const projects = await api.getProjects();
            console.error(`Debug: Got ${projects.length} projects from API`);
            console.error("Debug: First project:", JSON.stringify(projects[0], null, 2));
            
            if (projects.length === 0) {
                console.log("No projects found");
                return;
            }

            // Sort projects by name
            projects.sort((a, b) => a.name.localeCompare(b.name));
            
            if (options.json) {
                // Create a map of project IDs to projects for easy parent lookup
                const projectMap = new Map(projects.map(p => [p.id, p]));

                // Function to build the full path of a project
                const getProjectPath = (project) => {
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

                // Add full path to each project in the JSON output
                const projectsWithPath = projects.map(project => ({
                    ...project,
                    fullPath: getProjectPath(project)
                }));

                // Pretty print JSON with 2 space indent
                console.log(JSON.stringify(projectsWithPath, null, 2));
                return;
            }

            if (options.detailed) {
                // Print each project with full details
                projects.forEach(project => {
                    console.log(`Project: ${project.name}`);
                    console.log(`  ID: ${project.id}`);
                    console.log(`  Order: ${project.order}`);
                    console.log(`  Color: ${project.color}`);
                    if (project.parentId) console.log(`  Parent ID: ${project.parentId}`);
                    console.log(`  Favorite: ${project.isFavorite ? 'Yes' : 'No'}`);
                    console.log(`  URL: ${project.url}`);
                    console.log(`  View Style: ${project.viewStyle}`);
                    console.log(''); // Empty line between projects
                });
                return;
            }

            // Default output: ID and hierarchical name
            // Create a map of project IDs to projects for easy parent lookup
            const projectMap = new Map(projects.map(p => [p.id, p]));

            // Function to build the full path of a project
            const getProjectPath = (project) => {
                const path = [project.name];
                let current = project;
                
                while (current.parentId) {
                    const parent = projectMap.get(current.parentId);
                    if (!parent) break; // Safety check in case of missing parent
                    path.unshift(parent.name);
                    current = parent;
                }
                
                return path.join(' » ');
            };

            // Replace the default output section
            projects.forEach(project => {
                console.log(`${project.id}\t${getProjectPath(project)}`);
            });

        } catch (apiError) {
            console.error("Debug: API Error Details:", {
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
    detailed: process.argv.includes('--detailed')
};

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    listProjects(options);
}

export { listProjects }; 