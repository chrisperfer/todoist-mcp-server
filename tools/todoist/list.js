#!/usr/bin/env node

import { randomUUID } from 'crypto';
import { initializeApi, formatJsonOutput } from './lib/task-utils.js';

// Sync API endpoint
const SYNC_API_URL = 'https://api.todoist.com/sync/v9/sync';
const SYNC_PROJECT_GET_URL = 'https://api.todoist.com/sync/v9/projects/get';
const SYNC_PROJECT_GET_DATA_URL = 'https://api.todoist.com/sync/v9/projects/get_data';
const SYNC_ITEM_GET_URL = 'https://api.todoist.com/sync/v9/items/get';

async function syncGet(token, resourceTypes) {
    const response = await fetch(SYNC_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sync_token: '*',
            resource_types: resourceTypes
        })
    });

    const result = await response.json();
    if (!result) {
        throw new Error("No response from Sync API");
    }

    return result;
}

async function getProjectDetails(token, projectId, type = 'data') {
    const url = type === 'data' ? SYNC_PROJECT_GET_DATA_URL : SYNC_PROJECT_GET_URL;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: type === 'data' ? `project_id=${projectId}` : `project_id=${projectId}&all_data=true`
    });

    const result = await response.json();
    if (!result) {
        throw new Error("No response from Sync API");
    }

    return result;
}

async function getTaskDetails(token, taskId) {
    const response = await fetch(SYNC_ITEM_GET_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `item_id=${taskId}&all_data=true`
    });

    const result = await response.json();
    if (!result) {
        throw new Error("No response from Sync API");
    }

    return result;
}

async function listTasks(options = {}) {
    const api = await initializeApi();
    const token = process.env.TODOIST_API_TOKEN;

    try {
        // If a specific task ID is provided with --info flag
        if (options.taskId) {
            const details = await getTaskDetails(token, options.taskId);
            
            if (options.json) {
                console.log(JSON.stringify(details, null, 2));
                return;
            }

            // Print task details in a readable format
            const task = details.item;
            const project = details.project;
            console.log(`Task Details for "${task.content}" (${task.id}):`);
            console.log('----------------------------------------');
            console.log(`Project: ${project.name} (${project.id})`);
            console.log(`Priority: ${task.priority}`);
            console.log(`Due: ${task.due ? task.due.date : 'None'}`);
            console.log(`Created: ${task.added_at}`);
            console.log(`Description: ${task.description || 'None'}`);
            console.log(`Labels: ${task.labels.length > 0 ? task.labels.join(', ') : 'None'}`);
            console.log(`Status: ${task.checked ? 'Completed' : 'Active'}`);
            
            if (task.parent_id) {
                console.log(`Parent Task: ${task.parent_id}`);
            }

            if (details.notes && details.notes.length > 0) {
                console.log('\nNotes:');
                details.notes.forEach(note => {
                    console.log(`  - ${note.content} (posted: ${note.posted_at})`);
                });
            }
            return;
        }

        // Get all required data in a single sync call
        const data = await syncGet(token, ['items', 'projects', 'sections']);
        let tasks = data.items || [];
        const projects = data.projects || [];
        const sections = data.sections || [];

        // Create maps for quick lookups
        const projectMap = new Map(projects.map(p => [p.id, p]));
        const sectionMap = new Map(sections.map(s => [s.id, s]));

        // Apply filter if specified
        if (options.filter) {
            console.log(`Applying filter: ${options.filter}`);
            const url = `https://api.todoist.com/rest/v2/tasks?filter=${encodeURIComponent(options.filter)}`;
            console.log(`REST API URL: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Response status: ${response.status}`);
                console.error(`Response text: ${errorText}`);
                throw new Error(`Failed to fetch tasks: ${response.statusText}`);
            }

            const items = await response.json();
            console.log(`Filtered items count: ${items ? items.length : 0}`);
            if (items) {
                const filteredIds = new Set(items.map(item => item.id));
                tasks = tasks.filter(task => filteredIds.has(task.id));
            }
        }

        // Sort tasks by project and due date
        tasks.sort((a, b) => {
            const projectCompare = (a.project_id || "").localeCompare(b.project_id || "");
            if (projectCompare !== 0) return projectCompare;
            
            if (!a.due && !b.due) return 0;
            if (!a.due) return 1;
            if (!b.due) return -1;
            return a.due.date.localeCompare(b.due.date);
        });

        if (options.json) {
            console.log(JSON.stringify(tasks.map(task => ({
                ...task,
                project: projectMap.get(task.project_id)?.name || 'Inbox',
                section: sectionMap.get(task.section_id)?.name
            })), null, 2));
            return;
        }

        // Print tasks in a readable format
        tasks.forEach(task => {
            const project = projectMap.get(task.project_id);
            const section = sectionMap.get(task.section_id);
            const details = [];

            if (task.priority > 1) {
                details.push(`p${task.priority}`);
            }

            if (task.due) {
                if (task.due.datetime) {
                    details.push(`due ${task.due.datetime}`);
                } else {
                    details.push(`due ${task.due.date}`);
                }
            }

            details.push(`[${project?.name || 'Inbox'}]`);
            if (section) {
                details.push(`{${section.name}}`);
            }

            if (task.labels && task.labels.length > 0) {
                details.push(`@${task.labels.join(' @')}`);
            }

            const detailsStr = details.length > 0 ? ` (${details.join(', ')})` : '';
            console.log(`${task.id}\t${task.content}${detailsStr}`);
        });

    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

async function listProjects(options = {}) {
    const token = process.env.TODOIST_API_TOKEN;

    try {
        // If a specific project ID is provided with --data or --info flag
        if (options.projectId) {
            const type = options.data ? 'data' : 'info';
            const details = await getProjectDetails(token, options.projectId, type);
            
            if (options.json) {
                console.log(JSON.stringify(details, null, 2));
                return;
            }

            // Print project details in a readable format
            const project = details.project;
            console.log(`Project Details for ${project.name} (${project.id}):`);
            console.log('----------------------------------------');
            console.log(`Color: ${project.color}`);
            console.log(`Parent ID: ${project.parent_id || 'None'}`);
            console.log(`Archived: ${project.is_archived ? 'Yes' : 'No'}`);
            console.log(`Collapsed: ${project.collapsed ? 'Yes' : 'No'}`);
            console.log(`Shared: ${project.shared ? 'Yes' : 'No'}`);

            if (type === 'data') {
                // Print sections
                if (details.sections && details.sections.length > 0) {
                    console.log('\nSections:');
                    details.sections.forEach(section => {
                        console.log(`  - ${section.name} (${section.id})`);
                    });
                }

                // Print items (tasks)
                if (details.items && details.items.length > 0) {
                    console.log('\nTasks:');
                    details.items.forEach(item => {
                        const dueStr = item.due ? ` (due: ${item.due.date})` : '';
                        console.log(`  - ${item.content}${dueStr} (${item.id})`);
                    });
                }

                // Print project notes
                if (details.project_notes && details.project_notes.length > 0) {
                    console.log('\nProject Notes:');
                    details.project_notes.forEach(note => {
                        console.log(`  - ${note.content} (posted: ${note.posted_at})`);
                    });
                }
            } else {
                // Print notes for projects/get endpoint
                if (details.notes && details.notes.length > 0) {
                    console.log('\nNotes:');
                    details.notes.forEach(note => {
                        console.log(`  - ${note.content} (posted: ${note.posted_at})`);
                    });
                }
            }
            return;
        }

        const data = await syncGet(token, ['projects']);
        let projects = data.projects || [];

        // Create a map for quick parent lookups
        const projectMap = new Map(projects.map(p => [p.id, p]));

        // Build project paths
        projects.forEach(project => {
            const path = [project.name];
            let current = project;
            while (current.parent_id) {
                const parent = projectMap.get(current.parent_id);
                if (!parent) break;
                path.unshift(parent.name);
                current = parent;
            }
            project.full_path = path.join(' » ');
        });

        // Apply filter if specified
        if (options.filter) {
            const filterLower = options.filter.toLowerCase();
            projects = projects.filter(project => 
                project.name.toLowerCase().includes(filterLower) || 
                project.full_path.toLowerCase().includes(filterLower)
            );
        }

        if (options.json) {
            console.log(JSON.stringify(projects, null, 2));
            return;
        }

        // Print projects in a tree-like structure
        const printProject = (project, level = 0) => {
            const indent = '  '.repeat(level);
            console.log(`${indent}${project.id}\t${project.name}`);
            const children = projects.filter(p => p.parent_id === project.id);
            children.forEach(child => printProject(child, level + 1));
        };

        const rootProjects = projects.filter(p => !p.parent_id);
        rootProjects.forEach(project => printProject(project));

    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

async function listSections(options = {}) {
    const token = process.env.TODOIST_API_TOKEN;

    try {
        const data = await syncGet(token, ['sections', 'projects']);
        let sections = data.sections || [];
        const projects = data.projects || [];

        // Create project map for lookups
        const projectMap = new Map(projects.map(p => [p.id, p]));

        // Handle both --projectId and --filter p:NAME
        if (options.projectId) {
            sections = sections.filter(s => s.project_id.toString() === options.projectId);
        } else if (options.filter) {
            // Parse project filter (e.g., "p:Project Name")
            const projectMatch = options.filter.match(/^p:(.+)$/i);
            if (projectMatch) {
                const projectName = projectMatch[1].toLowerCase();
                const matchingProjects = projects.filter(p => 
                    p.name.toLowerCase().includes(projectName)
                );
                if (matchingProjects.length > 0) {
                    const projectIds = new Set(matchingProjects.map(p => p.id));
                    sections = sections.filter(s => projectIds.has(s.project_id));
                } else {
                    console.warn(`No projects found matching: ${projectMatch[1]}`);
                    sections = [];
                }
            } else {
                // Filter sections by name
                const filterLower = options.filter.toLowerCase();
                sections = sections.filter(s => 
                    s.name.toLowerCase().includes(filterLower)
                );
            }
        }

        if (options.json) {
            console.log(JSON.stringify(sections.map(section => ({
                ...section,
                project_name: projectMap.get(section.project_id)?.name || 'Unknown Project'
            })), null, 2));
            return;
        }

        // Group sections by project
        const sectionsByProject = new Map();
        sections.forEach(section => {
            const projectId = section.project_id;
            if (!sectionsByProject.has(projectId)) {
                sectionsByProject.set(projectId, []);
            }
            sectionsByProject.get(projectId).push(section);
        });

        // Print sections grouped by project
        for (const [projectId, projectSections] of sectionsByProject) {
            const project = projectMap.get(projectId);
            console.log(`\n${project?.name || 'Unknown Project'}:`);
            projectSections.forEach(section => {
                console.log(`  ${section.id}\t${section.name}`);
            });
        }

    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

function printHelp() {
    console.log(`
Usage: list <command> [options]

Commands:
  tasks     List tasks
  projects  List projects
  sections  List sections

Global Options:
  --json         Output in JSON format
  --help         Show this help message

Task Options:
  --filter <filter>      Use Todoist filter query (e.g., "today", "#Project 📁" - include emojis if present in project name)
  --taskId <id>         Get detailed information for a specific task

Project Options:
  --filter <text>        Filter projects by name (include emojis if present, e.g., "FLOOBY 🐒")
  --projectId <id>       Get detailed information for a specific project
  --data                 Include tasks, sections, and notes (use with --projectId)
  --info                 Include only project info and notes (use with --projectId)

Section Options:
  --projectId <id>       Filter sections by project ID
  --filter <filter>      Filter sections by name or project (e.g., "Meeting" or "p:FLOOBY 🐒")

Examples:
  list tasks --filter "today"
  list tasks --filter "#FLOOBY 🐒"                    # Include emoji if project has one
  list tasks --filter "p:Work & !p:Work/Archive"
  list tasks --taskId 123456789
  list projects --filter "FLOOBY 🐒"                  # Include emoji if project has one
  list projects --projectId 123456789 --data
  list projects --projectId 123456789 --info
  list sections --filter "p:FLOOBY 🐒"                # Include emoji if project has one
  list sections --filter "Meeting"

Note: When filtering by project name, make sure to include any emojis that are part of the project name.
      For example, use "#FLOOBY 🐒" instead of just "#FLOOBY" if the project includes the emoji.
`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const options = {
    json: args.includes('--json'),
    filter: null,
    projectId: null,
    taskId: null,
    data: args.includes('--data'),
    info: args.includes('--info')
};

// Get filter if specified
const filterIndex = args.indexOf('--filter');
if (filterIndex !== -1 && filterIndex + 1 < args.length) {
    options.filter = args[filterIndex + 1];
}

// Get project ID if specified
const projectIdIndex = args.indexOf('--projectId');
if (projectIdIndex !== -1 && projectIdIndex + 1 < args.length) {
    options.projectId = args[projectIdIndex + 1];
}

// Get task ID if specified
const taskIdIndex = args.indexOf('--taskId');
if (taskIdIndex !== -1 && taskIdIndex + 1 < args.length) {
    options.taskId = args[taskIdIndex + 1];
}

// Show help if requested or no command provided
if (args.includes('--help') || !command) {
    printHelp();
    process.exit(0);
}

// Execute the appropriate command
switch (command) {
    case 'tasks':
        listTasks(options);
        break;
    case 'projects':
        listProjects(options);
        break;
    case 'sections':
        listSections(options);
        break;
    default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
} 