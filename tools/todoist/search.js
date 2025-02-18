#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';
import {
    searchTasks,
    searchProjects,
    searchSections,
    formatTaskList,
    formatProjectList,
    formatSectionList,
    getFullProjectPath
} from './lib/id-utils.js';

async function search(type, query, options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }

        if (!query && !options.listAll) {
            console.error("Error: Search query is required unless using --all");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            let results;
            switch (type) {
                case 'task':
                    results = options.listAll ? 
                        await api.getTasks() : 
                        await searchTasks(api, query, options);
                    if (results.length === 0) {
                        console.log('No matching tasks found.');
                    } else {
                        console.log(formatTaskList(results, options.showParents));
                    }
                    break;

                case 'project':
                    results = options.listAll ? 
                        await api.getProjects() : 
                        await searchProjects(api, query, options);
                    if (results.length === 0) {
                        console.log('No matching projects found.');
                    } else {
                        // For projects, always show full paths
                        const projectsWithPaths = await Promise.all(results.map(async p => {
                            const pathInfo = await getFullProjectPath(api, p.id);
                            return {
                                ...p,
                                fullPath: pathInfo ? pathInfo.path : p.name
                            };
                        }));
                        console.log(formatProjectList(projectsWithPaths, true));
                    }
                    break;

                case 'section':
                    results = options.listAll ? 
                        await api.getSections() : 
                        await searchSections(api, query, options);
                    if (results.length === 0) {
                        console.log('No matching sections found.');
                    } else {
                        // For sections, include project information
                        const sectionsWithProjects = await Promise.all(results.map(async s => {
                            const pathInfo = await getFullProjectPath(api, s.projectId);
                            return {
                                ...s,
                                projectPath: pathInfo ? pathInfo.path : 'Unknown Project'
                            };
                        }));
                        console.log(formatSectionList(sectionsWithProjects));
                    }
                    break;

                default:
                    console.error(`Error: Unknown search type "${type}"`);
                    process.exit(1);
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

// Get search type
if (args.length === 0) {
    console.error("Error: Search type required (task, project, or section)");
    process.exit(1);
}

const type = args[0];
const options = {
    listAll: args.includes('--all'),
    exactMatch: args.includes('--exact'),
    showParents: args.includes('--show-parents')
};

// Get query (everything after type that's not a flag)
const query = args.slice(1)
    .filter(arg => !arg.startsWith('--'))
    .join(' ');

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    search(type, query, options);
}

export { search }; 