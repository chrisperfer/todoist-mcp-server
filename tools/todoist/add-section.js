#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function addSection(name, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!name) {
            console.error("Error: Section name is required");
            process.exit(1);
        }

        if (!options.project) {
            console.error("Error: Project is required (use --project)");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Get projects to resolve project path
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

            // Find the project by name or path
            const project = projects.find(p => 
                p.id === options.project || 
                getProjectPath(p).toLowerCase().includes(options.project.toLowerCase())
            );

            if (!project) {
                console.error(`Error: Project "${options.project}" not found`);
                process.exit(1);
            }

            // Create section
            const section = await api.addSection({
                name: name,
                projectId: project.id,
                order: options.order
            });

            // Output the created section
            if (options.json) {
                console.log(JSON.stringify({
                    ...section,
                    projectPath: getProjectPath(project)
                }, null, 2));
            } else {
                console.log(`Section created: ${section.id}`);
                console.log(`Name: ${section.name}`);
                console.log(`Project: ${getProjectPath(project)}`);
                if (section.order) console.log(`Order: ${section.order}`);
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
    order: undefined
};

// Get section name (everything before the first -- flag or all args if no flags)
const firstFlagIndex = args.findIndex(arg => arg.startsWith('--'));
const name = firstFlagIndex === -1 
    ? args.join(' ')
    : args.slice(0, firstFlagIndex).join(' ');

// Parse other options
let i = firstFlagIndex;
while (i !== -1 && i < args.length) {
    switch (args[i]) {
        case '--project':
            if (i + 1 < args.length) options.project = args[++i];
            break;
        case '--order':
            if (i + 1 < args.length) options.order = parseInt(args[++i], 10);
            break;
    }
    i++;
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    addSection(name, options);
}

export { addSection }; 