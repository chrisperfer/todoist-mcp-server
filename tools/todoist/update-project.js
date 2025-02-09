#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function updateProject(projectQuery, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!projectQuery) {
            console.error("Error: Project name or ID is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Get all projects to find the one to update
            const projects = await api.getProjects();
            
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

            // Find the project to update
            const project = projects.find(p => 
                (typeof projectQuery === 'string' && p.id === projectQuery) || 
                getProjectPath(p).toLowerCase().includes(projectQuery.toLowerCase())
            );

            if (!project) {
                console.error(`Error: Project "${projectQuery}" not found`);
                process.exit(1);
            }

            console.error("Debug: Found project to update:", {
                id: project.id,
                name: project.name,
                path: getProjectPath(project)
            });

            // Create update object
            const updateData = {
                ...(options.name && { name: options.name }),
                ...(options.color && { color: options.color }),
                ...(options.view && { viewStyle: options.view }),
                ...(options.favorite !== undefined && { isFavorite: options.favorite })
            };

            console.error("Debug: Original project:", {
                id: project.id,
                parentId: project.parentId,
                name: project.name,
                path: getProjectPath(project)
            });

            // Update the project
            try {
                await api.updateProject(project.id, updateData);
            } catch (updateError) {
                console.error("API Error:", updateError.message);
                throw updateError;
            }
            
            // Get updated project
            const updatedProject = await api.getProject(project.id);

            // Output the updated project
            if (options.json) {
                console.log(JSON.stringify(updatedProject, null, 2));
            } else {
                console.log(`Project updated: ${updatedProject.id}`);
                console.log(`Name: ${updatedProject.name}`);
                console.log(`Path: ${getProjectPath(updatedProject)}`);
                if (updatedProject.parentId) console.log(`Parent ID: ${updatedProject.parentId}`);
                if (updatedProject.color) console.log(`Color: ${updatedProject.color}`);
                if (updatedProject.viewStyle) console.log(`View Style: ${updatedProject.viewStyle}`);
                console.log(`Favorite: ${updatedProject.isFavorite ? 'Yes' : 'No'}`);
                console.log(`URL: ${updatedProject.url}`);
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
    name: null,
    color: null,
    view: null
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
        case '--name':
            if (i + 1 < args.length) options.name = args[++i];
            break;
        case '--color':
            if (i + 1 < args.length) options.color = args[++i];
            break;
        case '--view':
            if (i + 1 < args.length) options.view = args[++i];
            break;
        case '--favorite':
            options.favorite = true;
            break;
        case '--no-favorite':
            options.favorite = false;
            break;
    }
    i++;
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    updateProject(projectQuery, options);
}

export { updateProject }; 