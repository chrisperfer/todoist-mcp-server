#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function listProjects(options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);
        
        try {
            const projects = await api.getProjects();
            const sections = await api.getSections();
            
            if (projects.length === 0) {
                console.log("No projects found");
                return;
            }

            // Sort projects by name
            projects.sort((a, b) => a.name.localeCompare(b.name));
            
            // Group sections by project
            const projectSections = new Map();
            sections.forEach(section => {
                if (!projectSections.has(section.projectId)) {
                    projectSections.set(section.projectId, []);
                }
                projectSections.get(section.projectId).push(section);
            });

            if (options.json) {
                // Add sections to each project in the JSON output
                const projectsWithSections = projects.map(project => ({
                    ...project,
                    sections: (projectSections.get(project.id) || []).sort((a, b) => a.order - b.order)
                }));
                console.log(JSON.stringify(projectsWithSections, null, 2));
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
                    
                    const projectSectionList = projectSections.get(project.id) || [];
                    if (projectSectionList.length > 0) {
                        console.log('  Sections:');
                        projectSectionList
                            .sort((a, b) => a.order - b.order)
                            .forEach(section => {
                                console.log(`    ${section.id}: ${section.name}`);
                            });
                    }
                    console.log(''); // Empty line between projects
                });
                return;
            }

            // Default output: ID and hierarchical name with sections
            const projectMap = new Map(projects.map(p => [p.id, p]));

            // Function to build the full path
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

            projects.forEach(project => {
                console.log(`${project.id}\t${getProjectPath(project)}`);
                // Show sections indented under their project
                const projectSectionList = projectSections.get(project.id) || [];
                if (projectSectionList.length > 0) {
                    projectSectionList
                        .sort((a, b) => a.order - b.order)
                        .forEach(section => {
                            console.log(`\t${section.id}\t${section.name}`);
                        });
                }
            });

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
const options = {
    json: process.argv.includes('--json'),
    detailed: process.argv.includes('--detailed')
};

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    listProjects(options);
}

export { listProjects }; 