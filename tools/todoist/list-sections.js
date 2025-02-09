#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function listSections(options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);
        
        try {
            // Get all sections and projects
            const sections = await api.getSections();
            const projects = await api.getProjects();
            
            if (sections.length === 0) {
                console.log("No sections found");
                return;
            }

            // Create project map for resolving project paths
            const projectMap = new Map(projects.map(p => [p.id, p]));

            // Function to build the full project path
            const getProjectPath = (projectId) => {
                if (!projectId) return "Inbox";
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

            // Filter sections by project if specified
            let filteredSections = sections;
            if (options.project) {
                const projectFilter = options.project.toLowerCase();
                filteredSections = sections.filter(section => {
                    const projectPath = getProjectPath(section.projectId).toLowerCase();
                    return projectPath.includes(projectFilter);
                });

                if (filteredSections.length === 0) {
                    console.log(`No sections found in projects matching "${options.project}"`);
                    return;
                }
            }

            // Sort sections by project and order
            filteredSections.sort((a, b) => {
                const projectCompare = getProjectPath(a.projectId).localeCompare(getProjectPath(b.projectId));
                if (projectCompare !== 0) return projectCompare;
                return a.order - b.order;
            });

            if (options.json) {
                // Add project path to each section
                const sectionsWithProject = filteredSections.map(section => ({
                    ...section,
                    projectPath: getProjectPath(section.projectId)
                }));
                console.log(JSON.stringify(sectionsWithProject, null, 2));
                return;
            }

            if (options.detailed) {
                filteredSections.forEach(section => {
                    console.log(`Section: ${section.name}`);
                    console.log(`  ID: ${section.id}`);
                    console.log(`  Project: ${getProjectPath(section.projectId)}`);
                    console.log(`  Order: ${section.order}`);
                    console.log(''); // Empty line between sections
                });
                return;
            }

            // Default output: group by project
            let currentProject = null;
            filteredSections.forEach(section => {
                const projectPath = getProjectPath(section.projectId);
                if (projectPath !== currentProject) {
                    console.log(`\n${projectPath}:`);
                    currentProject = projectPath;
                }
                console.log(`  ${section.id}\t${section.name}`);
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
const args = process.argv.slice(2);
const options = {
    json: args.includes('--json'),
    detailed: args.includes('--detailed'),
    project: null
};

// Get project filter if specified
const projectIndex = args.indexOf('--project');
if (projectIndex !== -1 && projectIndex + 1 < args.length) {
    options.project = args[projectIndex + 1];
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    listSections(options);
}

export { listSections }; 