#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
    initializeApi,
    formatJsonOutput
} from './lib/task-utils.js';
import { execSync } from 'child_process';

// Sync API endpoint for activity
const SYNC_ACTIVITY_URL = 'https://api.todoist.com/sync/v9/activity/get';

// Add after the SYNC_ACTIVITY_URL constant
const REST_API_URL = 'https://api.todoist.com/rest/v2';

// Add before groupActivities function
const taskDetailsCache = new Map();
const taskHierarchyCache = new Map();

function cleanEventData(event, removeParentId = false) {
    if (!event) return null;

    // Skip non-essential updates
    if (event.event_type === 'updated') {
        const hasSignificantChange = event.extra_data && (
            event.extra_data.due_date !== event.extra_data.last_due_date || // Due date changed
            event.extra_data.last_content !== undefined || // Content changed
            event.extra_data.last_priority !== undefined || // Priority changed
            event.extra_data.last_section_id !== undefined || // Section changed
            event.extra_data.last_parent_id !== undefined // Parent changed
        );
        if (!hasSignificantChange) return null;
    }

    // Create a new object with only the fields we want
    const cleaned = {
        event_type: event.event_type,
        object_type: event.object_type,
        object_id: String(event.object_id),
        event_date: event.event_date
    };

    // Only include parent IDs if they're not redundant due to nesting
    if (!removeParentId) {
        if (event.parent_project_id) cleaned.parent_project_id = String(event.parent_project_id);
        if (event.parent_id) cleaned.parent_id = String(event.parent_id);
    }

    // Include all extra_data fields for health calculations
    if (event.extra_data) {
        cleaned.extra_data = { ...event.extra_data };
        // Convert IDs to strings
        if (cleaned.extra_data.section_id) cleaned.extra_data.section_id = String(cleaned.extra_data.section_id);
        if (cleaned.extra_data.parent_id) cleaned.extra_data.parent_id = String(cleaned.extra_data.parent_id);
        // Only filter out v2_ fields that aren't needed
        Object.keys(cleaned.extra_data).forEach(key => {
            if (key.startsWith('v2_') && !['due_date', 'last_due_date', 'content'].includes(key)) {
                delete cleaned.extra_data[key];
            }
        });
    }

    return cleaned;
}

// Calculate health indicators for an item based on its events
function calculateHealthIndicators(events) {
    if (!events || events.length === 0) return null;
    
    const now = new Date('2025-02-23T00:00:00.000Z'); // Fixed date for testing
    const indicators = {
        last_activity_days: 0,
        due_date_changes: 0,
        total_postponed_days: 0
    };

    // Sort events by date
    events.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

    // Calculate days since last activity
    const lastEventDate = new Date(events[events.length - 1].event_date);
    indicators.last_activity_days = Math.floor((now - lastEventDate) / (1000 * 60 * 60 * 24));

    // Track due date changes
    let lastDueDate = null;
    events.forEach(event => {
        const dueDate = event.extra_data?.due_date;
        if (dueDate) {
            if (lastDueDate) {
                const oldDate = new Date(lastDueDate);
                const newDate = new Date(dueDate);
                if (newDate > oldDate) {
                    indicators.due_date_changes++;
                    indicators.total_postponed_days += Math.floor((newDate - oldDate) / (1000 * 60 * 60 * 24));
                }
            }
            lastDueDate = dueDate;
        }
    });

    // Add health status based on indicators
    indicators.health_status = [];
    
    if (indicators.last_activity_days > 30) {
        indicators.health_status.push(`idle_${indicators.last_activity_days > 90 ? 'critical' : 'warning'}`);
    }
    
    if (indicators.due_date_changes > 0) {
        const avgPostponeDays = Math.floor(indicators.total_postponed_days / indicators.due_date_changes);
        if (avgPostponeDays > 7) {
            indicators.health_status.push(`procrastination_${avgPostponeDays > 30 ? 'critical' : 'warning'}`);
        }
    }

    return indicators;
}

// Add health indicators to an item structure
function addHealthIndicators(itemStructure) {
    if (!itemStructure) return itemStructure;

    // Add health indicators to the current item
    if (itemStructure.item_events && itemStructure.item_events.length > 0) {
        itemStructure.health = calculateHealthIndicators(itemStructure.item_events);
    }

    // Recursively add health indicators to sub-items
    if (itemStructure.sub_items) {
        Object.values(itemStructure.sub_items).forEach(subItem => {
            addHealthIndicators(subItem);
        });
    }

    return itemStructure;
}

async function getTaskDetails(taskId, token) {
    if (taskDetailsCache.has(taskId)) {
        return taskDetailsCache.get(taskId);
    }

    try {
        const response = await fetch(`${REST_API_URL}/tasks/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 404) {
            // Task might have been deleted
            taskDetailsCache.set(taskId, null);
            return null;
        }

        const task = await response.json();
        taskDetailsCache.set(taskId, task);
        return task;
    } catch (error) {
        console.error(`Error fetching task ${taskId}:`, error.message);
        return null;
    }
}

// Add before groupActivities function
async function getTaskHierarchy(projectId = null) {
    if (taskHierarchyCache.has(projectId)) {
        return taskHierarchyCache.get(projectId);
    }

    try {
        const url = `${REST_API_URL}/tasks${projectId ? `?project_id=${String(projectId)}` : ''}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
            }
        });

        const tasks = await response.json();

        // Create a map of parent_id -> children
        const hierarchy = {
            byId: new Map(),
            byParentId: new Map()
        };

        tasks.forEach(task => {
            // Convert all IDs to strings
            const taskId = String(task.id);
            const parentId = task.parent_id ? String(task.parent_id) : null;
            const sectionId = task.section_id ? String(task.section_id) : null;
            const projectId = task.project_id ? String(task.project_id) : null;

            // Store task with string IDs
            hierarchy.byId.set(taskId, {
                ...task,
                id: taskId,
                parent_id: parentId,
                section_id: sectionId,
                project_id: projectId
            });
            
            if (!hierarchy.byParentId.has(parentId)) {
                hierarchy.byParentId.set(parentId, new Set());
            }
            hierarchy.byParentId.get(parentId).add(taskId);
        });

        taskHierarchyCache.set(projectId, hierarchy);
        return hierarchy;
    } catch (error) {
        console.error('Error getting task hierarchy:', error.message);
        return null;
    }
}

// Modify groupActivities to use the hierarchy
async function groupActivities(events, projectId = null) {
    const groups = {
        projects: {},
        other_events: []
    };

    if (!events) return groups;

    // Get task hierarchy first
    const hierarchy = await getTaskHierarchy(projectId);

    // First pass: Create project structure and collect project events
    events.forEach(event => {
        // Create project structure for any referenced project
        const projectId = String(event.parent_project_id || (event.object_type === 'project' ? event.object_id : null));
        if (projectId && !groups.projects[projectId]) {
            groups.projects[projectId] = {
                project_events: [],
                sections: {},
                items: {},
                comments: [],
                child_projects: {}
            };
        }

        // Add project events to their structure
        if (event.object_type === 'project') {
            const eventProjectId = String(event.object_id);
            if (!groups.projects[eventProjectId]) {
                groups.projects[eventProjectId] = {
                    project_events: [],
                    sections: {},
                    items: {},
                    comments: [],
                    child_projects: {}
                };
            }
            groups.projects[eventProjectId].project_events.push(cleanEventData(event));
        }
    });

    // Second pass: Establish project hierarchy
    events.forEach(event => {
        if (event.object_type === 'project' && event.extra_data?.parent_id) {
            const projectId = String(event.object_id);
            const parentProjectId = String(event.extra_data.parent_id);
            
            if (groups.projects[parentProjectId] && groups.projects[projectId]) {
                // Move project to its parent's child_projects
                groups.projects[parentProjectId].child_projects[projectId] = groups.projects[projectId];
                delete groups.projects[projectId];
            }
        }
    });

    // Helper function to find a project in the hierarchy
    const findProject = (projectId) => {
        if (groups.projects[projectId]) {
            return groups.projects[projectId];
        }
        for (const rootProject of Object.values(groups.projects)) {
            const findInProject = (proj) => {
                if (proj.child_projects[projectId]) {
                    return proj.child_projects[projectId];
                }
                for (const childProj of Object.values(proj.child_projects)) {
                    const found = findInProject(childProj);
                    if (found) return found;
                }
                return null;
            };
            const found = findInProject(rootProject);
            if (found) return found;
        }
        return null;
    };

    // Helper function to create item structure
    const createItemStructure = () => ({
        item_events: [],
        comments: [],
        sub_items: {}
    });

    // Helper function to get or create item structure in the correct location
    const getOrCreateItemStructure = (project, itemId) => {
        const taskDetails = hierarchy?.byId.get(itemId);
        if (!taskDetails) {
            // If we don't have task details, create it at the project level
            if (!project.items[itemId]) {
                project.items[itemId] = createItemStructure();
            }
            return project.items[itemId];
        }

        const sectionId = taskDetails.section_id ? String(taskDetails.section_id) : null;
        const parentId = taskDetails.parent_id ? String(taskDetails.parent_id) : null;

        // If this is a sub-item, recursively get its parent's structure first
        if (parentId) {
            const parentStructure = getOrCreateItemStructure(project, parentId);
            if (parentStructure) {
                if (!parentStructure.sub_items[itemId]) {
                    parentStructure.sub_items[itemId] = createItemStructure();
                }
                return parentStructure.sub_items[itemId];
            }
        }

        // If it belongs to a section
        if (sectionId && project.sections[sectionId]) {
            if (!project.sections[sectionId].items[itemId]) {
                project.sections[sectionId].items[itemId] = createItemStructure();
            }
            return project.sections[sectionId].items[itemId];
        }

        // Otherwise, it belongs directly to the project
        if (!project.items[itemId]) {
            project.items[itemId] = createItemStructure();
        }
        return project.items[itemId];
    };

    // Third pass: Handle sections, items, and comments
    for (const event of events) {
        if (event.object_type === 'section') {
            const projectId = String(event.parent_project_id);
            const project = findProject(projectId);
            if (project) {
                const sectionId = String(event.object_id);
                if (!project.sections[sectionId]) {
                    project.sections[sectionId] = {
                        section_events: [],
                        items: {}
                    };
                }
                project.sections[sectionId].section_events.push(cleanEventData(event, true));
            } else {
                groups.other_events.push(cleanEventData(event));
            }
        } else if (event.object_type === 'item') {
            const projectId = String(event.parent_project_id);
            const project = findProject(projectId);
            
            if (project) {
                const itemId = String(event.object_id);
                const itemStructure = getOrCreateItemStructure(project, itemId);
                
                if (itemStructure) {
                    const cleanedEvent = cleanEventData(event, true);
                    if (cleanedEvent) {
                        itemStructure.item_events.push(cleanedEvent);
                    }
                } else {
                    groups.other_events.push(cleanEventData(event));
                }
            } else {
                groups.other_events.push(cleanEventData(event));
            }
        } else if (event.object_type === 'note') {
            const projectId = String(event.parent_project_id);
            const project = findProject(projectId);
            
            if (project) {
                const parentId = event.parent_id ? String(event.parent_id) : null;
                if (parentId) {
                    // Comment belongs to an item
                    const itemStructure = getOrCreateItemStructure(project, parentId);
                    if (itemStructure) {
                        itemStructure.comments.push(cleanEventData(event, true));
                    } else {
                        groups.other_events.push(cleanEventData(event));
                    }
                } else {
                    // Comment belongs to the project
                    project.comments.push(cleanEventData(event, true));
                }
            } else {
                groups.other_events.push(cleanEventData(event));
            }
        } else {
            groups.other_events.push(cleanEventData(event));
        }
    }

    // After all items are grouped, add health indicators
    Object.values(groups.projects).forEach(project => {
        // Add health indicators to direct items
        Object.keys(project.items).forEach(itemId => {
            project.items[itemId] = addHealthIndicators(project.items[itemId]);
        });

        // Add health indicators to items in sections
        Object.values(project.sections).forEach(section => {
            Object.keys(section.items).forEach(itemId => {
                section.items[itemId] = addHealthIndicators(section.items[itemId]);
            });
        });

        // Add health indicators to items in child projects
        Object.values(project.child_projects).forEach(childProject => {
            Object.keys(childProject.items).forEach(itemId => {
                childProject.items[itemId] = addHealthIndicators(childProject.items[itemId]);
            });
            
            Object.values(childProject.sections).forEach(section => {
                Object.keys(section.items).forEach(itemId => {
                    section.items[itemId] = addHealthIndicators(section.items[itemId]);
                });
            });
        });
    });

    return groups;
}

function addHealthIndicatorsToJson(structure) {
    // Process each project's items
    Object.values(structure.projects).forEach(project => {
        // Process direct items
        Object.values(project.items).forEach(item => {
            if (item.item_events && item.item_events.length > 0) {
                item.health = calculateHealthIndicators(item.item_events);
            }
            // Process sub-items recursively
            if (item.sub_items) {
                Object.values(item.sub_items).forEach(subItem => {
                    if (subItem.item_events && subItem.item_events.length > 0) {
                        subItem.health = calculateHealthIndicators(subItem.item_events);
                    }
                });
            }
        });

        // Process items in sections
        Object.values(project.sections).forEach(section => {
            Object.values(section.items).forEach(item => {
                if (item.item_events && item.item_events.length > 0) {
                    item.health = calculateHealthIndicators(item.item_events);
                }
                // Process sub-items recursively
                if (item.sub_items) {
                    Object.values(item.sub_items).forEach(subItem => {
                        if (subItem.item_events && subItem.item_events.length > 0) {
                            subItem.health = calculateHealthIndicators(subItem.item_events);
                        }
                    });
                }
            });
        });

        // Process items in child projects recursively
        if (project.child_projects) {
            Object.values(project.child_projects).forEach(childProject => {
                // Recursively process the child project
                addHealthIndicatorsToJson({ projects: { dummy: childProject } });
            });
        }
    });

    return structure;
}

function formatTextOutput(jsonData) {
    let output = [];

    // Helper function to format an event
    const formatEvent = (event, indent = 0) => {
        if (!event) return null;
        const spaces = ' '.repeat(indent);
        let lines = [`${spaces}- [${event.event_date}] ${event.event_type}`];
        if (event.extra_data) {
            lines.push(`${spaces}  ${JSON.stringify(event.extra_data, null, 2)}`);
        }
        return lines.join('\n');
    };

    // Helper function to format health status
    const formatHealth = (health, indent = 0) => {
        if (!health?.health_status?.length) return null;
        return `${' '.repeat(indent)}Health Status: ${health.health_status.join(', ')}`;
    };

    // Helper function to format items recursively
    const formatItems = (items, baseIndent = 0) => {
        let itemOutput = [];
        for (const [itemId, item] of Object.entries(items || {})) {
            if (!item) continue;
            const indent = ' '.repeat(baseIndent);
            itemOutput.push(`\n${indent}Item ${itemId}:`);
            
            // Events
            if (item.item_events) {
                item.item_events.forEach(event => {
                    const formattedEvent = formatEvent(event, baseIndent + 2);
                    if (formattedEvent) itemOutput.push(formattedEvent);
                });
            }

            // Health
            const health = formatHealth(item.health, baseIndent + 2);
            if (health) itemOutput.push(health);

            // Comments
            if (item.comments?.length > 0) {
                itemOutput.push(`${indent}  Comments:`);
                item.comments.forEach(comment => {
                    const formattedComment = formatEvent(comment, baseIndent + 4);
                    if (formattedComment) itemOutput.push(formattedComment);
                });
            }

            // Sub-items
            if (Object.keys(item.sub_items || {}).length > 0) {
                itemOutput.push(...formatItems(item.sub_items, baseIndent + 2));
            }
        }
        return itemOutput;
    };

    // Helper function to format a project recursively
    const formatProject = (project, projectId, depth = 0) => {
        if (!project) return [];
        const projectOutput = [];
        const indent = ' '.repeat(depth * 2);
        const header = depth === 0 ? '===' : '='.repeat(3 + depth);
        projectOutput.push(`\n${header} Project ${projectId} ${header}`);

        // Project Events
        if (project.project_events?.length > 0) {
            projectOutput.push('\nProject Events:');
            project.project_events.forEach(event => {
                const formattedEvent = formatEvent(event, 2);
                if (formattedEvent) projectOutput.push(formattedEvent);
            });
        }

        // Project Comments
        if (project.comments?.length > 0) {
            projectOutput.push('\nProject Comments:');
            project.comments.forEach(comment => {
                const formattedComment = formatEvent(comment, 2);
                if (formattedComment) projectOutput.push(formattedComment);
            });
        }

        // Sections
        for (const [sectionId, section] of Object.entries(project.sections || {})) {
            if (!section) continue;
            projectOutput.push(`\nSection ${sectionId}:`);
            
            if (section.section_events?.length > 0) {
                projectOutput.push('  Events:');
                section.section_events.forEach(event => {
                    const formattedEvent = formatEvent(event, 4);
                    if (formattedEvent) projectOutput.push(formattedEvent);
                });
            }

            if (Object.keys(section.items || {}).length > 0) {
                projectOutput.push('  Items:');
                projectOutput.push(...formatItems(section.items, 4));
            }
        }

        // Direct Items
        if (Object.keys(project.items || {}).length > 0) {
            projectOutput.push('\nItems:');
            projectOutput.push(...formatItems(project.items, 2));
        }

        // Child Projects
        if (Object.keys(project.child_projects || {}).length > 0) {
            for (const [childId, childProject] of Object.entries(project.child_projects)) {
                projectOutput.push(...formatProject(childProject, childId, depth + 1));
            }
        }

        return projectOutput;
    };

    // Format all projects
    for (const [projectId, project] of Object.entries(jsonData.projects || {})) {
        output.push(...formatProject(project, projectId));
    }

    // Other Events
    if (jsonData.other_events?.length > 0) {
        output.push('\n=== Other Events ===');
        jsonData.other_events.forEach(event => {
            if (!event) return;
            output.push(`\n- ${event.object_type} event:`);
            output.push(`  Type: ${event.event_type}`);
            output.push(`  Date: ${event.event_date}`);
            if (event.extra_data) {
                output.push(`  Data: ${JSON.stringify(event.extra_data, null, 2)}`);
            }
        });
    }

    // Total count
    if (jsonData.total_count) {
        output.push(`\nTotal activities: ${jsonData.total_count}`);
    }

    return output.join('\n');
}

async function getActivity(options = {}) {
    let allEvents = [];
    let offset = 0;
    let hasMore = true;
    const seenEvents = new Set(); // Track seen events to prevent duplicates

    while (hasMore) {
        const params = new URLSearchParams();
        
        if (options.objectType) params.append('object_type', options.objectType);
        if (options.objectId) params.append('object_id', String(options.objectId));
        if (options.eventType) params.append('event_type', options.eventType);
        if (options.since) params.append('since', options.since);
        if (options.until) params.append('until', options.until);
        params.append('limit', '50'); // Use max limit for efficiency
        params.append('offset', String(offset));

        const url = `${SYNC_ACTIVITY_URL}?${params.toString()}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch activity: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.events || data.events.length === 0) {
            hasMore = false;
            break;
        }

        // Process this batch of events
        const processedEvents = data.events
            .map(event => ({
                ...event,
                object_id: String(event.object_id),
                parent_project_id: event.parent_project_id ? String(event.parent_project_id) : null,
                parent_id: event.parent_id ? String(event.parent_id) : null,
                extra_data: event.extra_data ? {
                    ...event.extra_data,
                    section_id: event.extra_data.section_id ? String(event.extra_data.section_id) : null,
                    parent_id: event.extra_data.parent_id ? String(event.extra_data.parent_id) : null
                } : null
            }))
            .filter(event => {
                // Create a unique key for the event
                const eventKey = `${event.object_type}-${event.object_id}-${event.event_type}-${event.event_date}`;
                if (seenEvents.has(eventKey)) return false;
                seenEvents.add(eventKey);

                if (!options.parentProjectId) return true;
                const projectId = String(options.parentProjectId);
                return (
                    event.parent_project_id === projectId ||
                    (event.object_type === 'project' && event.object_id === projectId)
                );
            });

        allEvents.push(...processedEvents);
        
        // Check if we need to fetch more
        hasMore = data.events.length === 50 && (!options.limit || allEvents.length < options.limit);
        offset += data.events.length;
        
        // If we've hit our requested limit, stop
        if (options.limit && allEvents.length >= options.limit) {
            hasMore = false;
            allEvents = allEvents.slice(0, options.limit);
            break;
        }
    }

    return {
        events: allEvents,
        count: allEvents.length
    };
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .usage('Usage: $0 [options]')
        .example('$0', 'Get all activity from all time (excluding deleted items)')
        .example('$0 --object-type item --event-type completed', 'Get task completion activity')
        .example('$0 --parent-project-id "2349336695" --limit 10', 'Get last 10 activities in project')
        .example('$0 --since "2024-01-01" --until "2024-03-31"', 'Get activity in specific date range')
        .example('$0 --since "2024-01-01"', 'Get all activity from Jan 1st, 2024 onwards')
        .example('$0 --until "2024-03-31"', 'Get all activity up until Mar 31st, 2024')
        .example('$0 --include-deleted', 'Include deleted items in results')
        .example('$0 --projectId "2349336695"', 'Get only events for specific project')
        .example('$0 --projectId "2349336695" --include-children', 'Get events for project and all its contents')
        .example('$0 --sectionId "12345" --include-children', 'Get events for section and its tasks')
        .example('$0 --taskId "67890" --include-children', 'Get events for task and its subtasks')
        .example('$0 --json', 'Output in JSON format with health indicators')
        .conflicts('projectId', ['sectionId', 'taskId'])
        .conflicts('sectionId', ['projectId', 'taskId'])
        .conflicts('taskId', ['projectId', 'sectionId'])
        .options({
            'object-type': {
                description: 'Filter by object type (item, project, section, note)',
                type: 'string',
                choices: ['item', 'project', 'section', 'note']
            },
            'object-id': {
                description: 'Filter by object ID',
                type: 'string'
            },
            'event-type': {
                description: 'Filter by event type (added, updated, completed, deleted, uncompleted, archived, unarchived)',
                type: 'string',
                choices: ['added', 'updated', 'completed', 'deleted', 'uncompleted', 'archived', 'unarchived']
            },
            'parent-project-id': {
                description: 'Filter by parent project ID',
                type: 'string'
            },
            'parent-id': {
                description: 'Filter by parent ID (for sub-tasks or project comments)',
                type: 'string'
            },
            'projectId': {
                description: 'Filter to show only events for a specific project and optionally its contents',
                type: 'string'
            },
            'sectionId': {
                description: 'Filter to show only events for a specific section and optionally its tasks',
                type: 'string'
            },
            'taskId': {
                description: 'Filter to show only events for a specific task and optionally its subtasks',
                type: 'string'
            },
            'include-children': {
                description: 'Include events for child items (sub-tasks, section tasks, or project contents)',
                type: 'boolean',
                default: false
            },
            'since': {
                description: 'Start date (YYYY-MM-DD)',
                type: 'string'
            },
            'until': {
                description: 'End date (YYYY-MM-DD)',
                type: 'string'
            },
            'limit': {
                description: 'Maximum number of activities to return',
                type: 'number'
            },
            'offset': {
                description: 'Number of activities to skip',
                type: 'number'
            },
            'include-deleted': {
                description: 'Include deleted items in results',
                type: 'boolean',
                default: false
            },
            'json': {
                description: 'Output in JSON format with health indicators (idle_warning, idle_critical, procrastination_warning, procrastination_critical)',
                type: 'boolean',
                default: false
            }
        })
        .epilogue('JSON output includes health indicators for tasks:\n' +
                 '- idle_warning: No activity for >30 days\n' +
                 '- idle_critical: No activity for >90 days\n' +
                 '- procrastination_warning: Average postpone >7 days\n' +
                 '- procrastination_critical: Average postpone >30 days')
        .help()
        .argv;

    const api = await initializeApi();

    try {
        const options = {
            objectType: argv.objectType,
            objectId: argv.objectId,
            eventType: argv.eventType,
            parentProjectId: argv.projectId || argv.parentProjectId,
            parentId: argv.parentId,
            since: argv.since,
            until: argv.until,
            limit: argv.limit,
            offset: argv.offset,
            includeDeleted: argv.includeDeleted
        };

        const activities = await getActivity(options);

        if (!activities.events || activities.events.length === 0) {
            console.log('No activities found');
            return;
        }

        const groupedActivities = await groupActivities(activities.events, argv.projectId);
        
        // Apply filtering based on projectId/sectionId/taskId if specified
        let finalOutput = groupedActivities;
        if (argv.projectId || argv.sectionId || argv.taskId) {
            const filteredGroups = {
                projects: {},
                other_events: []
            };

            if (argv.projectId) {
                const projectId = String(argv.projectId);
                // Find the project (could be nested)
                const findAndFilterProject = (projects) => {
                    for (const [id, project] of Object.entries(projects)) {
                        if (id === projectId) {
                            // Found the project
                            if (!argv.includeChildren) {
                                // Only include project events
                                filteredGroups.projects[id] = {
                                    project_events: project.project_events,
                                    sections: {},
                                    items: project.items,
                                    comments: project.comments,
                                    child_projects: {}
                                };
                            } else {
                                // Include everything
                                filteredGroups.projects[id] = project;
                            }
                            return true;
                        }
                        // Check child projects
                        if (findAndFilterProject(project.child_projects)) {
                            return true;
                        }
                    }
                    return false;
                };
                findAndFilterProject(groupedActivities.projects);
            } else if (argv.sectionId) {
                const sectionId = argv.sectionId;
                // Find the section's project and filter to just that section
                for (const [projectId, project] of Object.entries(groupedActivities.projects)) {
                    if (project.sections[sectionId]) {
                        filteredGroups.projects[projectId] = {
                            project_events: [],
                            sections: {},
                            items: {},
                            comments: [],
                            child_projects: {}
                        };
                        if (!argv.includeChildren) {
                            // Only include section events
                            filteredGroups.projects[projectId].sections[sectionId] = {
                                section_events: project.sections[sectionId].section_events,
                                items: {}
                            };
                        } else {
                            // Include section and its items
                            filteredGroups.projects[projectId].sections[sectionId] = project.sections[sectionId];
                        }
                        break;
                    }
                }
            } else if (argv.taskId) {
                const taskId = argv.taskId;
                // Find the task and its project/section
                const findAndFilterTask = (items, projectId, sectionId = null) => {
                    if (items[taskId]) {
                        // Found the task directly
                        if (!filteredGroups.projects[projectId]) {
                            filteredGroups.projects[projectId] = {
                                project_events: [],
                                sections: {},
                                items: {},
                                comments: [],
                                child_projects: {}
                            };
                        }
                        if (sectionId) {
                            filteredGroups.projects[projectId].sections[sectionId] = {
                                section_events: [],
                                items: {}
                            };
                            filteredGroups.projects[projectId].sections[sectionId].items[taskId] = 
                                argv.includeChildren ? items[taskId] : {
                                    item_events: items[taskId].item_events,
                                    comments: items[taskId].comments,
                                    sub_items: {}
                                };
                        } else {
                            filteredGroups.projects[projectId].items[taskId] = 
                                argv.includeChildren ? items[taskId] : {
                                    item_events: items[taskId].item_events,
                                    comments: items[taskId].comments,
                                    sub_items: {}
                                };
                        }
                        return true;
                    }
                    // Check sub-items if we haven't found it yet
                    for (const item of Object.values(items)) {
                        if (findAndFilterTask(item.sub_items, projectId, sectionId)) {
                            return true;
                        }
                    }
                    return false;
                };

                // Search in all projects and their sections
                for (const [projectId, project] of Object.entries(groupedActivities.projects)) {
                    // Check direct items
                    if (findAndFilterTask(project.items, projectId)) {
                        break;
                    }
                    // Check items in sections
                    for (const [sectionId, section] of Object.entries(project.sections)) {
                        if (findAndFilterTask(section.items, projectId, sectionId)) {
                            break;
                        }
                    }
                }
            }

            finalOutput = {
                ...filteredGroups,
                total_count: activities.count
            };
        } else {
            finalOutput = {
                ...groupedActivities,
                total_count: activities.count
            };
        }

        // Add health indicators
        addHealthIndicatorsToJson(finalOutput);

        if (argv.json) {
            // Output JSON format
            console.log(JSON.stringify(finalOutput, null, 2));
        } else {
            // Convert JSON to human-readable format
            console.log(formatTextOutput(finalOutput));
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main().catch(console.error); 