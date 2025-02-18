#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function listTasks(options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);
        
        try {
            // Get tasks with optional filter
            const tasks = await api.getTasks(options.filter ? { filter: options.filter } : undefined);
            
            if (tasks.length === 0) {
                console.log("No tasks found");
                return;
            }

            // Get projects and sections for resolving names
            const projects = await api.getProjects();
            const sections = await api.getSections();
            const projectMap = new Map(projects.map(p => [p.id, p]));
            const sectionMap = new Map(sections.map(s => [s.id, s]));

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

            // Function to check if a string is a valid project ID
            const isProjectId = (str) => {
                return /^\d+$/.test(str);
            };

            // Function to get section name with project context
            const getSectionInfo = (task) => {
                if (!task.sectionId) return null;
                const section = sectionMap.get(task.sectionId);
                if (!section) return null;
                return section.name;
            };

            // Filter tasks by project if specified
            let filteredTasks = tasks;
            if (options.project) {
                if (!isProjectId(options.project)) {
                    console.error("Error: --projectId parameter must be a numeric project ID. Use --filter 'p:Project Name' to filter by project name.");
                    process.exit(1);
                }
                const projectId = options.project;
                filteredTasks = tasks.filter(task => String(task.projectId) === projectId);

                if (filteredTasks.length === 0) {
                    console.log(`No tasks found in project with ID "${options.project}"`);
                    return;
                }
            }

            // Filter tasks by labels if specified
            if (options.labels && options.labels.length > 0) {
                filteredTasks = filteredTasks.filter(task => {
                    // Convert task labels to lowercase for case-insensitive comparison
                    const taskLabels = new Set((task.labels || []).map(label => 
                        label.toLowerCase().replace(/^goals:\s*/i, '')  // Remove 'goals:' prefix if present
                    ));
                    // Check if task has all specified labels
                    return options.labels.every(label => 
                        taskLabels.has(label.toLowerCase())
                    );
                });

                if (filteredTasks.length === 0) {
                    console.log(`No tasks found with labels: @${options.labels.join(', @')}`);
                    return;
                }
            }

            // Sort tasks by project and due date
            filteredTasks.sort((a, b) => {
                const projectCompare = (a.projectId || "").localeCompare(b.projectId || "");
                if (projectCompare !== 0) return projectCompare;
                
                if (!a.due && !b.due) return 0;
                if (!a.due) return 1;
                if (!b.due) return -1;
                return a.due.date.localeCompare(b.due.date);
            });

            if (options.json) {
                // Add project path and format labels to each task
                const tasksWithProject = filteredTasks.map(task => ({
                    ...task,
                    projectPath: getProjectPath(task.projectId),
                    section: getSectionInfo(task),
                    labels: task.labels || []
                }));
                console.log(JSON.stringify(tasksWithProject, null, 2));
                return;
            }

            if (options.detailed) {
                filteredTasks.forEach(task => {
                    console.log(`Task: ${task.content}`);
                    console.log(`  ID: ${task.id}`);
                    console.log(`  Project: ${getProjectPath(task.projectId)}`);
                    const section = getSectionInfo(task);
                    if (section) console.log(`  Section: ${section}`);
                    if (task.due) console.log(`  Due: ${task.due.date}${task.due.datetime ? ' ' + task.due.datetime : ''}`);
                    if (task.priority) console.log(`  Priority: ${task.priority}`);
                    if (task.labels && task.labels.length) console.log(`  Labels: @${task.labels.join(', @')}`);
                    if (task.description) console.log(`  Description: ${task.description}`);
                    console.log(`  URL: ${task.url}`);
                    console.log(''); // Empty line between tasks
                });
                return;
            }

            // Default output: task info with priority, deadline, due date, project and labels
            filteredTasks.forEach(task => {
                let details = [];
                
                // Add priority if it exists (p4 is highest, p1 is lowest)
                if (task.priority > 1) {
                    details.push(`p${task.priority}`);
                }
                
                // Add due date and time if they exist
                if (task.due) {
                    if (task.due.datetime) {
                        details.push(`due ${task.due.datetime}`);
                    } else {
                        details.push(`due ${task.due.date}`);
                    }
                }

                // Add project name
                const projectPath = getProjectPath(task.projectId);
                details.push(`[${projectPath}]`);

                // Add section if it exists
                const section = getSectionInfo(task);
                if (section) {
                    details.push(`{${section}}`);
                }

                // Add labels if they exist
                if (task.labels && task.labels.length > 0) {
                    details.push(`@${task.labels.join(' @')}`);
                }

                // Combine all details
                const detailsStr = details.length > 0 ? ` (${details.join(', ')})` : '';
                
                console.log(`${task.id}\t${task.content}${detailsStr}`);
            });

        } catch (apiError) {
            console.error("API Error Details:", {
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
    detailed: process.argv.includes('--detailed'),
    project: null,
    labels: [],
    filter: null
};

// Get project filter if specified
const projectIndex = process.argv.indexOf('--projectId');
if (projectIndex !== -1 && projectIndex + 1 < process.argv.length) {
    options.project = process.argv[projectIndex + 1];
}

// Get filter if specified
const filterIndex = process.argv.indexOf('--filter');
if (filterIndex !== -1 && filterIndex + 1 < process.argv.length) {
    options.filter = process.argv[filterIndex + 1];
}

// Get all label filters
let labelIndex = process.argv.indexOf('--label');
while (labelIndex !== -1) {
    if (labelIndex + 1 < process.argv.length) {
        options.labels.push(process.argv[labelIndex + 1]);
    }
    labelIndex = process.argv.indexOf('--label', labelIndex + 1);
}

// Print help if requested
if (process.argv.includes('--help')) {
    console.log(`
Usage: list-tasks [options]

Options:
  --json                Output in JSON format
  --detailed           Show detailed task information
  --projectId <id>     Filter tasks by project ID (numeric only)
  --label <label>      Filter tasks by label (can be used multiple times)
  --filter <filter>    Use Todoist filter query (recommended, see examples below)
  --help              Show this help message

Project Filtering:
  1. Using filter (Recommended):
     --filter "p:Project Name"           Filter by project name
     --filter "(p:Project1 | p:Project2)" Filter by multiple projects
     --filter "p:Work & !p:Work/Archive"  Complex project filters

  2. Using project ID:
     --projectId 123456789              Filter by specific project ID

Other Filter Examples:
  --filter "today"                     Show today's tasks
  --filter "overdue"                   Show overdue tasks
  --filter "priority 4"                Show high priority tasks
  --filter "no date & !assigned to:"   Show tasks without dates and not assigned
  --filter "@waiting & !today"         Show waiting tasks not due today

For more filter examples, visit:
https://www.todoist.com/help/articles/introduction-to-filters-V98wIH
`);
    process.exit(0);
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    listTasks(options);
}

export { listTasks }; 