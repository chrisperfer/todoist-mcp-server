#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
    initializeApi,
    formatJsonOutput,
    getProjectPath
} from './lib/task-utils.js';
import { execSync } from 'child_process';

// Sync API endpoint for activity
const SYNC_ACTIVITY_URL = 'https://api.todoist.com/sync/v9/activity/get';

// Add after the SYNC_ACTIVITY_URL constant
const SYNC_COMPLETED_URL = 'https://api.todoist.com/sync/v9/completed/get_all';
const SYNC_KARMA_URL = 'https://api.todoist.com/sync/v9/completed/get_stats';

const REST_API_URL = 'https://api.todoist.com/rest/v2';

// Add before groupActivities function
const taskDetailsCache = new Map();
const taskHierarchyCache = new Map();

// Add project cache
const projectCache = new Map();

// Add karma reason code definitions
const KARMA_REASON_CODES = {
    // Positive karma reasons
    '1': 'You added tasks',
    '2': 'You completed tasks',
    '3': 'Usage of advanced features',
    '4': 'You are using Todoist. Thanks!',
    '5': 'Signed up for Todoist Beta!',
    '6': 'Used Todoist Support section!',
    '7': 'For using Todoist Pro - thanks for supporting us!',
    '8': 'Getting Started Guide task completed!',
    '9': 'Daily Goal reached!',
    '10': 'Weekly Goal reached!',
    // Negative karma reasons
    '50': 'You have tasks that are over x days overdue',
    '52': 'Inactive for a longer period of time'
};

function cleanEventData(event, stringifyIds = false) {
    if (!event) return null;
    
    const cleanedEvent = {
        event_type: event.event_type,
        object_type: event.object_type,
        object_id: stringifyIds ? String(event.object_id) : event.object_id,
        event_date: event.event_date
    };

    if (event.parent_project_id) {
        cleanedEvent.parent_project_id = stringifyIds ? String(event.parent_project_id) : event.parent_project_id;
    }

    if (event.parent_id) {
        cleanedEvent.parent_id = stringifyIds ? String(event.parent_id) : event.parent_id;
    }

    if (event.extra_data) {
        cleanedEvent.extra_data = { ...event.extra_data };
        if (stringifyIds) {
            if (cleanedEvent.extra_data.section_id) {
                cleanedEvent.extra_data.section_id = String(cleanedEvent.extra_data.section_id);
            }
            if (cleanedEvent.extra_data.parent_id) {
                cleanedEvent.extra_data.parent_id = String(cleanedEvent.extra_data.parent_id);
            }
        }
    }

    return cleanedEvent;
}

// Calculate health indicators for an item based on its events
function calculateHealthIndicators(events) {
    if (!events || events.length === 0) return null;

    // Sort events by date, newest first
    const sortedEvents = [...events].sort((a, b) => 
        new Date(b.event_date) - new Date(a.event_date)
    );

    const now = new Date();
    const lastEventDate = new Date(sortedEvents[0].event_date);
    const lastActivityDays = Math.floor((now - lastEventDate) / (1000 * 60 * 60 * 24));

    let dueDateChanges = 0;
    let totalPostponedDays = 0;
    let consecutivePostpones = 0;
    let maxConsecutivePostpones = 0;
    let lastPostponeDate = null;

    // Track due date changes and postponements
    for (let i = 0; i < sortedEvents.length; i++) {
        const event = sortedEvents[i];
        if (event.event_type === 'updated' && event.extra_data) {
            const { due_date, last_due_date } = event.extra_data;
            
            if (due_date && last_due_date) {
                const dueDate = new Date(due_date);
                const lastDueDate = new Date(last_due_date);
                
                if (dueDate > lastDueDate) {
                    dueDateChanges++;
                    const postponeDays = Math.floor((dueDate - lastDueDate) / (1000 * 60 * 60 * 24));
                    totalPostponedDays += postponeDays;

                    // Check if this is a consecutive postpone (within 24 hours of last postpone)
                    const eventDate = new Date(event.event_date);
                    if (lastPostponeDate && (eventDate - lastPostponeDate) <= (24 * 60 * 60 * 1000)) {
                        consecutivePostpones++;
                        maxConsecutivePostpones = Math.max(maxConsecutivePostpones, consecutivePostpones);
                    } else {
                        consecutivePostpones = 1;
                    }
                    lastPostponeDate = eventDate;
                }
            }
        }
    }

    // Calculate average postpone days
    const avgPostponeDays = dueDateChanges > 0 ? totalPostponedDays / dueDateChanges : 0;

    // Initialize health status array
    const healthStatus = [];

    // Add warnings based on metrics
    if (lastActivityDays > 7) {
        healthStatus.push('idle');
    }

    if (dueDateChanges > 0) {
        if (avgPostponeDays >= 7) {
            healthStatus.push('long_postpones');
        }
        if (maxConsecutivePostpones >= 3) {
            healthStatus.push('frequent_postpones');
        }
    }

    return {
        last_activity_days: lastActivityDays,
        due_date_changes: dueDateChanges,
        total_postponed_days: totalPostponedDays,
        avg_postpone_days: avgPostponeDays,
        max_consecutive_postpones: maxConsecutivePostpones,
        health_status: healthStatus
    };
}

// Add health indicators to an item structure
async function addHealthIndicators(itemStructure) {
    if (!itemStructure) return itemStructure;

    // Add health indicators to the current item if it has events
    if (itemStructure.item_events?.length > 0) {
        const healthIndicators = calculateHealthIndicators(itemStructure.item_events);
        itemStructure.health = healthIndicators;
    }

    // Recursively add health indicators to sub-items
    if (itemStructure.sub_items) {
        for (const subItem of Object.values(itemStructure.sub_items)) {
            if (subItem) await addHealthIndicators(subItem);
        }
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
        other_events: [],
        total_count: events.length
    };

    if (!events) return groups;

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
                const itemStructure = project.items[itemId] || createItemStructure();
                project.items[itemId] = itemStructure;
                
                const cleanedEvent = cleanEventData(event, true);
                if (cleanedEvent) {
                    itemStructure.item_events.push(cleanedEvent);
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
                    const itemStructure = project.items[parentId] || createItemStructure();
                    project.items[parentId] = itemStructure;
                    itemStructure.comments.push(cleanEventData(event, true));
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

    return groups;
}

async function addHealthIndicatorsToJson(structure) {
    if (!structure?.projects) return structure;

    // Process each project
    for (const project of Object.values(structure.projects)) {
        // Process direct items
        if (project.items) {
            for (const item of Object.values(project.items)) {
                if (item.item_events?.length > 0) {
                    const healthIndicators = calculateHealthIndicators(item.item_events);
                    item.health = healthIndicators;
                }
            }
        }

        // Process items in sections
        if (project.sections) {
            for (const section of Object.values(project.sections)) {
                if (section.items) {
                    for (const item of Object.values(section.items)) {
                        if (item.item_events?.length > 0) {
                            const healthIndicators = calculateHealthIndicators(item.item_events);
                            item.health = healthIndicators;
                        }
                    }
                }
            }
        }

        // Process child projects recursively
        if (project.child_projects) {
            await addHealthIndicatorsToJson({ projects: project.child_projects });
        }
    }

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
            
            // Display health indicators prominently at the top
            if (item.health) {
                if (item.health.health_status?.length > 0) {
                    itemOutput.push(`${indent}  ⚠️ Health Status: ${item.health.health_status.join(', ')}`);
                }
                if (item.health.last_activity_days !== undefined) {
                    itemOutput.push(`${indent}  📅 Last Activity: ${item.health.last_activity_days} days ago`);
                }
                if (item.health.due_date_changes > 0) {
                    itemOutput.push(`${indent}  🔄 Due Date Changes: ${item.health.due_date_changes}`);
                    itemOutput.push(`${indent}  ⏰ Average Postpone: ${Math.round(item.health.avg_postpone_days)} days`);
                    if (item.health.max_consecutive_postpones > 1) {
                        itemOutput.push(`${indent}  📊 Max Consecutive Postpones: ${item.health.max_consecutive_postpones}`);
                    }
                }
                itemOutput.push(''); // Add a blank line for readability
            }
            
            // Events
            if (item.item_events) {
                item.item_events.forEach(event => {
                    const formattedEvent = formatEvent(event, baseIndent + 2);
                    if (formattedEvent) itemOutput.push(formattedEvent);
                });
            }

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
        const projectName = projectCache.get(String(projectId)) || `Project ${projectId}`;
        projectOutput.push(`\n${header} ${projectName} ${header}`);

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

// Add before main()
async function getCompleted(options = {}) {
    const params = new URLSearchParams();
    
    if (options.projectId) params.append('project_id', String(options.projectId));
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));
    if (options.since) params.append('since', options.since);
    if (options.until) params.append('until', options.until);
    
    const url = `${SYNC_COMPLETED_URL}?${params.toString()}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch completed tasks: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
        items: data.items || [],
        projects: data.projects || {},
        total_count: (data.items || []).length
    };
}

// Add before getKarmaStats
async function getKarmaStats() {
    const response = await fetch(SYNC_KARMA_URL, {
        headers: {
            'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch karma stats: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Raw API Response:', JSON.stringify(data, null, 2));
    
    if (!data) {
        throw new Error('No karma stats found in response');
    }

    return {
        karma: data.karma,
        karma_trend: {
            karma_inc: data.karma_last_update,
            trend: data.karma_trend
        },
        completed_count: data.completed_count,
        daily_goal: data.goals?.daily_goal,
        weekly_goal: data.goals?.weekly_goal,
        ignored_days: data.goals?.ignore_days?.map(day => {
            // Convert numeric day (1-7) to day name
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            return days[day - 1];
        }) || [],
        daily_streak: data.goals?.current_daily_streak?.count,
        max_daily_streak: data.goals?.max_daily_streak?.count,
        weekly_streak: data.goals?.current_weekly_streak?.count,
        max_weekly_streak: data.goals?.max_weekly_streak?.count,
        karma_updates: data.karma_update_reasons?.map(update => ({
            date: update.time,
            karma: update.new_karma,
            reasons: update.positive_karma_reasons.map(code => ({
                reason_code: code,
                karma_inc: update.positive_karma / update.positive_karma_reasons.length
            })),
            positive_karma_reasons_detail: update.positive_karma_reasons.map(code => KARMA_REASON_CODES[String(code)]),
            negative_karma_reasons_detail: update.negative_karma_reasons.map(code => KARMA_REASON_CODES[String(code)])
        })) || [],
        karma_graph_data: data.karma_graph_data || [],
        days_items: data.days_items || [],
        week_items: data.week_items || []
    };
}

// Add function to fetch all projects at once
async function fetchAndCacheProjects(api) {
    if (projectCache.size > 0) return; // Already cached

    try {
        const response = await fetch(`${REST_API_URL}/projects`, {
            headers: {
                'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
        }

        const projects = await response.json();
        
        // Build path cache for each project
        for (const project of projects) {
            let path = project.name;
            let currentProject = project;
            
            // Build full path by walking up parent hierarchy
            while (currentProject.parent_id) {
                const parent = projects.find(p => p.id === currentProject.parent_id);
                if (!parent) break;
                path = `${parent.name} > ${path}`;
                currentProject = parent;
            }
            
            projectCache.set(String(project.id), path);
        }
    } catch (error) {
        console.error('Error fetching projects:', error.message);
    }
}

// Update formatCompletedOutput to use the cache
async function formatCompletedOutput(data, jsonOutput = false) {
    const api = await initializeApi();
    await fetchAndCacheProjects(api);

    const formattedItems = data.items.map(item => {
        const projectPath = projectCache.get(String(item.project_id)) || `Unknown Project (${item.project_id})`;
        return {
            content: item.content,
            project: projectPath,
            completed_at: item.completed_at
        };
    });

    if (jsonOutput) {
        return JSON.stringify(formattedItems, null, 2);
    }

    let output = [];

    // Group items by project
    const itemsByProject = {};
    formattedItems.forEach(item => {
        if (!itemsByProject[item.project]) {
            itemsByProject[item.project] = [];
        }
        itemsByProject[item.project].push(item);
    });

    // Output items grouped by project
    for (const [projectName, projectItems] of Object.entries(itemsByProject)) {
        output.push(`\n=== Project: ${projectName} ===\n`);
        
        projectItems.forEach(item => {
            output.push(`- [${item.completed_at}] ${item.content}`);
        });
    }

    return output.join('\n');
}

// Update formatKarmaOutput to handle all karma information
async function formatKarmaOutput(data, jsonOutput = false) {
    const api = await initializeApi();
    await fetchAndCacheProjects(api);

    const formattedStats = {
        karma: data.karma,
        today: {
            total: data.today_stats?.total_count || 0,
            completed: data.today_stats?.completed_count || 0
        },
        week: {
            total: data.week_stats?.total_count || 0,
            completed: data.week_stats?.completed_count || 0
        },
        goals: {
            daily: data.daily_goal,
            weekly: data.weekly_goal,
            ignored_days: data.ignored_days
        },
        streaks: {
            daily: {
                current: data.current_daily_streak,
                max: data.max_daily_streak
            },
            weekly: {
                current: data.current_weekly_streak,
                max: data.max_weekly_streak
            }
        },
        karma_updates: data.karma_updates || []
    };

    if (jsonOutput) {
        return JSON.stringify(formattedStats, null, 2);
    }

    let output = [];
    output.push('=== Current Karma Status ===');
    output.push(`Current Karma: ${data.karma}`);
    if (data.karma_trend) {
        output.push(`Last Update: ${data.karma_trend.karma_inc || 0}`);
        output.push(`Trend: ${data.karma_trend.trend || 'STABLE'}`);
    }
    output.push(`Total Completed Tasks: ${data.completed_count || 0}`);

    output.push('\n=== Goals ===');
    output.push(`Daily Goal: ${data.daily_goal} tasks`);
    output.push(`Weekly Goal: ${data.weekly_goal} tasks`);
    output.push(`Ignored Days: ${data.ignored_days.join(', ')}`);

    output.push('\nStreaks:');
    if (data.current_daily_streak) {
        output.push(`- Current Daily Streak: ${data.current_daily_streak} days`);
    }
    if (data.max_daily_streak) {
        output.push(`- Max Daily Streak: ${data.max_daily_streak} days`);
    }
    if (data.current_weekly_streak) {
        output.push(`- Current Weekly Streak: ${data.current_weekly_streak} weeks`);
    }
    if (data.max_weekly_streak) {
        output.push(`- Max Weekly Streak: ${data.max_weekly_streak} weeks`);
    }

    if (data.karma_updates?.length > 0) {
        output.push('\n=== Recent Karma Updates ===');
        for (const update of data.karma_updates) {
            output.push(`\nUpdate on ${update.date}:`);
            output.push(`- New Karma: ${update.karma}`);
            if (update.reasons?.length > 0) {
                output.push('- Positive Changes:');
                for (const reason of update.reasons) {
                    const description = KARMA_REASON_CODES[reason.reason_code] || 'Unknown reason';
                    output.push(`  • ${description} (+${reason.karma_inc})`);
                }
            }
        }
    }

    if (data.daily_stats?.length > 0) {
        output.push('\n=== Daily Completion Stats ===');
        for (const day of data.daily_stats) {
            output.push(`\nDate: ${day.date}`);
            output.push(`Total Completed: ${day.total_completed}`);
            if (day.projects?.length > 0) {
                output.push('Projects:');
                for (const project of day.projects) {
                    const projectName = projectCache.get(String(project.id)) || `Unknown Project (${project.id})`;
                    output.push(`- ${projectName}: ${project.completed_count} tasks`);
                }
            }
        }
    }

    if (data.weekly_stats?.length > 0) {
        output.push('\n=== Weekly Completion Stats ===');
        for (const week of data.weekly_stats) {
            output.push(`\nWeek: ${week.week || 'Unknown Week'}`);
            output.push(`Total Completed: ${week.total_completed}`);
            if (week.projects?.length > 0) {
                output.push('Projects:');
                for (const project of week.projects) {
                    const projectName = projectCache.get(String(project.id)) || `Unknown Project (${project.id})`;
                    output.push(`- ${projectName}: ${project.completed_count} tasks`);
                }
            }
        }
    }

    return output.join('\n');
}

// Add after the karma and completed functions

async function generateReport() {
    // Fetch all the necessary data
    const karmaData = await getKarmaStats();
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    const completedData = await getCompleted({
        since: thirtyDaysAgo.toISOString().split('T')[0]
    });

    // Get active tasks with @Next label
    const nextTasks = await fetch(`${REST_API_URL}/tasks?filter=@Next`, {
        headers: {
            'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
        }
    }).then(res => res.json());

    // Get all tasks for health analysis
    const allTasks = await fetch(`${REST_API_URL}/tasks`, {
        headers: {
            'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
        }
    }).then(res => res.json());

    // Get activity for health analysis
    const activities = await getActivity({
        since: thirtyDaysAgo.toISOString().split('T')[0],
        objectType: 'item'
    });

    // Fetch and cache projects
    await fetchAndCacheProjects();

    // Process activities for health indicators
    const groupedActivities = await groupActivities(activities.events);
    await addHealthIndicatorsToJson(groupedActivities);

    // Collect health statistics
    const healthStats = {
        idle: 0,
        long_postpones: 0,
        frequent_postpones: 0,
        healthy: 0,
        total: 0
    };

    // Helper function to process items for health stats
    const processItemsForHealth = (items) => {
        for (const item of Object.values(items)) {
            if (item.health) {
                healthStats.total++;
                if (item.health.health_status.length === 0) {
                    healthStats.healthy++;
                } else {
                    item.health.health_status.forEach(status => {
                        healthStats[status]++;
                    });
                }
            }
        }
    };

    // Process all items for health statistics
    Object.values(groupedActivities.projects).forEach(project => {
        processItemsForHealth(project.items);
        Object.values(project.sections).forEach(section => {
            processItemsForHealth(section.items);
        });
    });

    // Generate life goals distribution
    const lifeGoals = {};
    const processedProjects = new Set();

    const categorizeProject = (projectPath) => {
        const topLevel = projectPath.split(' > ')[0];
        // Skip Inbox and projects starting with a dash
        if (topLevel === 'Inbox' || topLevel.startsWith('-')) {
            return null;
        }
        if (!lifeGoals[topLevel]) {
            lifeGoals[topLevel] = {
                total: 0,
                completed: 0
            };
        }
        return topLevel;
    };

    // Process completed tasks
    completedData.items.forEach(item => {
        const projectPath = projectCache.get(String(item.project_id));
        if (projectPath) {
            const category = categorizeProject(projectPath);
            if (category) {  // Only count if not skipped
                lifeGoals[category].completed++;
            }
        }
    });

    // Process active tasks
    allTasks.forEach(task => {
        const projectPath = projectCache.get(String(task.project_id));
        if (projectPath) {
            const category = categorizeProject(projectPath);
            if (category) {  // Only count if not skipped
                lifeGoals[category].total++;
            }
        }
    });

    // Generate project activity stats
    const projectActivity = {};
    completedData.items.forEach(item => {
        const projectPath = projectCache.get(String(item.project_id));
        if (projectPath) {
            projectActivity[projectPath] = (projectActivity[projectPath] || 0) + 1;
        }
    });

    // Sort project activity for top 5
    const topProjects = Object.entries(projectActivity)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    // Generate HTML report
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todoist Status Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card h2 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-box {
            background: #fff;
            padding: 15px;
            border-radius: 6px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stat-box h3 {
            margin: 0;
            color: #7f8c8d;
            font-size: 0.9em;
            text-transform: uppercase;
        }
        .stat-box p {
            margin: 10px 0 0;
            font-size: 1.8em;
            font-weight: bold;
            color: #2c3e50;
        }
        .chart-container {
            position: relative;
            height: 300px;
            margin: 20px 0;
        }
        .next-actions {
            list-style-type: none;
            padding: 0;
        }
        .next-actions li {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .next-actions li:last-child {
            border-bottom: none;
        }
        .project-path {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        .due-date {
            color: #e74c3c;
            font-size: 0.9em;
        }
        .trend-indicator {
            font-size: 1.2em;
            margin-left: 5px;
        }
        .trend-up {
            color: #27ae60;
        }
        .trend-down {
            color: #e74c3c;
        }
        .trend-stable {
            color: #f1c40f;
        }
        .completion-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .completion-table th,
        .completion-table td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #eee;
        }
        .completion-table th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        .karma-updates {
            list-style: none;
            padding: 0;
        }
        .karma-updates li {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .karma-reason {
            color: #7f8c8d;
            font-size: 0.9em;
            margin-left: 20px;
            padding: 2px 8px;
            border-radius: 4px;
        }
        .karma-reason.positive {
            color: #27ae60;
            background-color: rgba(39, 174, 96, 0.1);
        }
        .karma-reason.negative {
            color: #e74c3c;
            background-color: rgba(231, 76, 60, 0.1);
        }
        .karma-value {
            font-weight: bold;
        }
        .karma-value.positive {
            color: #27ae60;
        }
        .karma-value.negative {
            color: #e74c3c;
        }
        .health-container {
            display: flex;
            gap: 20px;
            margin-top: 20px;
        }
        .postponed-tasks {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            max-height: 400px;
            overflow-y: auto;
        }
        .task-list {
            margin-top: 10px;
        }
        .task-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
        }
        .task-item:last-child {
            border-bottom: none;
        }
        .task-content {
            font-weight: 500;
            color: #2c3e50;
        }
        .task-project {
            font-size: 0.9em;
            color: #7f8c8d;
            margin: 4px 0;
        }
        .task-stats {
            font-size: 0.85em;
            color: #e67e22;
            display: flex;
            gap: 15px;
        }
        .task-stats span {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
    </style>
</head>
<body>
    <div class="card">
        <h2>🎯 Life Goals Distribution</h2>
        <div style="display: flex; flex-wrap: wrap; gap: 30px; align-items: flex-start;">
            <div class="chart-container" style="flex: 3; min-width: 400px; height: 400px; padding-top: 20px;">
                <canvas id="lifeGoalsChart"></canvas>
            </div>
            <div class="chart-container" style="flex: 2; min-width: 350px; height: 400px; background: rgba(255,255,255,0.8); border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <canvas id="lifeGoalsRadarChart"></canvas>
            </div>
        </div>
    </div>

    <div class="card">
        <h2>💊 Task Health Overview</h2>
        <div class="health-container">
            <div class="chart-container" style="flex: 1;">
                <canvas id="healthChart"></canvas>
            </div>
            <div class="postponed-tasks" style="flex: 1;">
                <h3>Most Postponed Tasks</h3>
                <div class="task-list">
                    ${(() => {
                        // Collect all tasks with postponements
                        const postponedTasks = [];
                        const processItems = (items, projectPath) => {
                            for (const [itemId, item] of Object.entries(items || {})) {
                                if (item?.health?.due_date_changes > 0) {
                                    postponedTasks.push({
                                        content: item.item_events[0]?.extra_data?.content || 'Unknown Task',
                                        projectPath,
                                        avgPostponeDays: item.health.avg_postpone_days,
                                        totalPostpones: item.health.due_date_changes,
                                        lastEventDate: item.item_events[0]?.event_date
                                    });
                                }
                            }
                        };

                        // Process all projects and their items
                        Object.entries(groupedActivities.projects || {}).forEach(([projectId, project]) => {
                            const projectPath = projectCache.get(String(projectId)) || 'Unknown Project';
                            processItems(project.items, projectPath);
                            Object.values(project.sections || {}).forEach(section => {
                                processItems(section.items, projectPath);
                            });
                        });

                        // Sort by severity (avg postpone days * total postpones) instead of recency
                        return postponedTasks
                            .sort((a, b) => (b.avgPostponeDays * Math.pow(b.totalPostpones, 2)) - (a.avgPostponeDays * Math.pow(a.totalPostpones, 2)))
                            .slice(0, 10)
                            .map(task => `
                                <div class="task-item">
                                    <div class="task-content">${task.content}</div>
                                    <div class="task-project">📂 ${task.projectPath}</div>
                                    <div class="task-stats">
                                        <span title="Average days postponed">⏰ ${Math.round(task.avgPostponeDays)} days avg.</span>
                                        <span title="Total times postponed">🔄 ${task.totalPostpones}x postponed</span>
                                        <span title="Severity score">⚠️ Score: ${Math.round(task.avgPostponeDays * Math.pow(task.totalPostpones, 2))}</span>
                                    </div>
                                </div>
                            `)
                            .join('');
                    })()}
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <h2>🏆 Karma & Productivity</h2>
        <div class="stats-grid">
            <div class="stat-box">
                <h3>Current Karma</h3>
                <p>
                    ${karmaData.karma}
                    <span class="trend-indicator ${karmaData.karma_trend?.trend === 'up' ? 'trend-up' : karmaData.karma_trend?.trend === 'down' ? 'trend-down' : 'trend-stable'}">
                        ${karmaData.karma_trend?.trend === 'up' ? '↑' : karmaData.karma_trend?.trend === 'down' ? '↓' : '→'}
                        ${karmaData.karma_trend?.karma_inc >= 0 ? '+' : ''}${karmaData.karma_trend?.karma_inc || 0}
                    </span>
                </p>
            </div>
            <div class="stat-box">
                <h3>Daily Goal</h3>
                <p>${karmaData.daily_goal} tasks</p>
            </div>
            <div class="stat-box">
                <h3>Weekly Goal</h3>
                <p>${karmaData.weekly_goal} tasks</p>
            </div>
            <div class="stat-box">
                <h3>Daily Streak</h3>
                <p>${karmaData.daily_streak || 0} days</p>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-box">
                <h3>Daily Streak Record</h3>
                <p>${karmaData.max_daily_streak || 0} days</p>
            </div>
            <div class="stat-box">
                <h3>Weekly Streak</h3>
                <p>${karmaData.weekly_streak || 0} weeks</p>
            </div>
            <div class="stat-box">
                <h3>Weekly Streak Record</h3>
                <p>${karmaData.max_weekly_streak || 0} weeks</p>
            </div>
            <div class="stat-box">
                <h3>30-Day Completion Rate</h3>
                <p>${((completedData.items.length / (completedData.items.length + allTasks.length)) * 100).toFixed(1)}%</p>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-box">
                <h3>30-Day Total</h3>
                <p>${completedData.items.length}</p>
            </div>
            <div class="stat-box">
                <h3>Daily Average</h3>
                <p>${(completedData.items.length / 30).toFixed(1)}</p>
            </div>
            <div class="stat-box">
                <h3>Weekly Average</h3>
                <p>${((completedData.items.length / 30) * 7).toFixed(1)}</p>
            </div>
            <div class="stat-box">
                <h3>Total Completed</h3>
                <p>${karmaData.completed_count || 0} tasks</p>
            </div>
        </div>

        <div class="chart-container">
            <canvas id="karmaHistoryChart"></canvas>
        </div>

        <h3>Daily Completion Breakdown</h3>
        <table class="completion-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Completed Tasks</th>
                    <th>Most Active Project</th>
                </tr>
            </thead>
            <tbody>
                ${karmaData.days_items?.slice(0, 7).map(day => {
                    const topProject = day.items?.reduce((a, b) => 
                        (a.completed > b.completed) ? a : b, { completed: 0 });
                    return `
                        <tr>
                            <td>${new Date(day.date).toLocaleDateString()}</td>
                            <td>${day.total_completed}</td>
                            <td>${topProject ? projectCache.get(String(topProject.id)) || 'Unknown Project' : 'N/A'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>

        <h3>Weekly Completion Breakdown</h3>
        <table class="completion-table">
            <thead>
                <tr>
                    <th>Week</th>
                    <th>Completed Tasks</th>
                    <th>Most Active Project</th>
                </tr>
            </thead>
            <tbody>
                ${karmaData.week_items?.slice(0, 4).map(week => {
                    const topProject = week.items?.reduce((a, b) => 
                        (a.completed > b.completed) ? a : b, { completed: 0 });
                    return `
                        <tr>
                            <td>${week.date}</td>
                            <td>${week.total_completed}</td>
                            <td>${topProject ? projectCache.get(String(topProject.id)) || 'Unknown Project' : 'N/A'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    </div>

    <div class="card">
        <h2>📈 Project Activity (30 Days)</h2>
        <div class="chart-container">
            <canvas id="projectActivityChart"></canvas>
        </div>
    </div>

    <div class="card">
        <h2>⏭️ Next Actions</h2>
        <ul class="next-actions">
            ${nextTasks.map(task => `
                <li>
                    <div>${task.content}</div>
                    <div class="project-path">📂 ${projectCache.get(String(task.project_id)) || 'Unknown Project'}</div>
                    ${task.due?.date ? `<div class="due-date">📅 Due: ${task.due.date}</div>` : ''}
                </li>
            `).join('')}
        </ul>
    </div>

    <script>
        // Life Goals Chart
        new Chart(document.getElementById('lifeGoalsChart'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(Object.keys(lifeGoals))},
                datasets: [{
                    label: 'Active Tasks',
                    data: ${JSON.stringify(Object.values(lifeGoals).map(g => g.total))},
                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }, {
                    label: 'Completed Tasks',
                    data: ${JSON.stringify(Object.values(lifeGoals).map(g => g.completed))},
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        ticks: {
                            font: {
                                size: 12
                            }
                        }
                    },
                    x: {
                        stacked: true,
                        ticks: {
                            font: {
                                size: 13,
                                weight: '500'
                            }
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Life Goals Distribution',
                        font: {
                            size: 18,
                            weight: 'bold'
                        },
                        padding: {
                            top: 0,
                            bottom: 20
                        }
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                size: 13
                            },
                            padding: 15
                        }
                    }
                }
            }
        });

        // Life Goals Radar Chart
        new Chart(document.getElementById('lifeGoalsRadarChart'), {
            type: 'radar',
            data: {
                labels: ${JSON.stringify(Object.keys(lifeGoals))},
                datasets: [{
                    label: 'Active Tasks',
                    data: ${JSON.stringify(Object.values(lifeGoals).map(g => g.total))},
                    backgroundColor: 'rgba(54, 162, 235, 0.3)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(54, 162, 235, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(54, 162, 235, 1)',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }, {
                    label: 'Completed Tasks',
                    data: ${JSON.stringify(Object.values(lifeGoals).map(g => g.completed))},
                    backgroundColor: 'rgba(75, 192, 192, 0.3)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(75, 192, 192, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(75, 192, 192, 1)',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        angleLines: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.2)',
                            lineWidth: 1
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.15)',
                            lineWidth: 1
                        },
                        ticks: {
                            backdropColor: 'transparent',
                            font: {
                                size: 11
                            },
                            showLabelBackdrop: false,
                            maxTicksLimit: 5
                        },
                        pointLabels: {
                            font: {
                                size: 14,
                                weight: '600'
                            },
                            padding: 8
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Life Goals Balance',
                        font: {
                            size: 18,
                            weight: 'bold'
                        },
                        padding: {
                            top: 0,
                            bottom: 20
                        }
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                size: 13
                            },
                            padding: 15,
                            boxWidth: 30
                        }
                    },
                    tooltip: {
                        titleFont: {
                            size: 14
                        },
                        bodyFont: {
                            size: 13
                        },
                        padding: 10,
                        displayColors: true
                    }
                }
            }
        });

        // Health Chart
        new Chart(document.getElementById('healthChart'), {
            type: 'pie',
            data: {
                labels: ['Healthy', 'Idle', 'Long Postpones', 'Frequent Postpones'],
                datasets: [{
                    data: [
                        ${healthStats.healthy},
                        ${healthStats.idle},
                        ${healthStats.long_postpones},
                        ${healthStats.frequent_postpones}
                    ],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.5)',
                        'rgba(255, 206, 86, 0.5)',
                        'rgba(255, 159, 64, 0.5)',
                        'rgba(255, 99, 132, 0.5)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(255, 159, 64, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Task Health Distribution',
                        font: {
                            size: 20,
                            weight: 'bold'
                        },
                        padding: 20
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                size: 14
                            },
                            padding: 20
                        }
                    }
                }
            }
        });

        // Project Activity Chart
        new Chart(document.getElementById('projectActivityChart'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(topProjects.map(([name]) => name))},
                datasets: [{
                    label: 'Completed Tasks',
                    data: ${JSON.stringify(topProjects.map(([, count]) => count))},
                    backgroundColor: 'rgba(153, 102, 255, 0.5)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Most Active Projects (30 Days)',
                        font: {
                            size: 20,
                            weight: 'bold'
                        },
                        padding: 20
                    }
                }
            }
        });

        // Karma History Chart
        new Chart(document.getElementById('karmaHistoryChart'), {
            type: 'line',
            data: {
                labels: ${JSON.stringify([...(karmaData.days_items || [])].reverse().map(day => 
                    new Date(day.date).toLocaleDateString()
                ))},
                datasets: [{
                    label: 'Tasks Completed',
                    type: 'bar',
                    data: ${JSON.stringify([...(karmaData.days_items || [])].reverse().map(day => day.total_completed))},
                    backgroundColor: 'rgba(75, 192, 192, 0.3)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                    yAxisID: 'y'
                }, {
                    label: 'Karma Average',
                    type: 'line',
                    data: ${JSON.stringify(karmaData.karma_graph_data?.map(k => k.karma_avg))},
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: 'rgba(255, 99, 132, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(255, 99, 132, 1)',
                    pointHoverBorderWidth: 3,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Tasks Completed'
                        }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Karma Average'
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        min: Math.floor(Math.min(...${JSON.stringify(karmaData.karma_graph_data?.map(k => k.karma_avg))} || []) * 0.999),
                        max: Math.ceil(Math.max(...${JSON.stringify(karmaData.karma_graph_data?.map(k => k.karma_avg))} || []) * 1.001),
                        ticks: {
                            maxTicksLimit: 8
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Daily Task Completion & Karma History',
                        font: {
                            size: 20,
                            weight: 'bold'
                        },
                        padding: 20
                    },
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                size: 14
                            },
                            padding: 20
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;

    return html;
}

// Update the main function to handle async formatters
async function main() {
    const argv = yargs(hideBin(process.argv))
        .usage('Usage: $0 <command> [options]')
        .command('activity', 'Get activity information from Todoist', (yargs) => {
            return yargs
                .example('$0 activity', 'Get all activity from all time (excluding deleted items)')
                .example('$0 activity --object-type item --event-type completed', 'Get task completion activity')
                .example('$0 activity --parent-project-id "2349336695" --limit 10', 'Get last 10 activities in project')
                .example('$0 activity --since "2024-01-01" --until "2024-03-31"', 'Get activity in specific date range')
                .example('$0 activity --since "2024-01-01"', 'Get all activity from Jan 1st, 2024 onwards')
                .example('$0 activity --until "2024-03-31"', 'Get all activity up until Mar 31st, 2024')
                .example('$0 activity --include-deleted', 'Include deleted items in results')
                .example('$0 activity --projectId "2349336695"', 'Get only events for specific project')
                .example('$0 activity --projectId "2349336695" --include-children', 'Get events for project and all its contents')
                .example('$0 activity --sectionId "12345" --include-children', 'Get events for section and its tasks')
                .example('$0 activity --taskId "67890" --include-children', 'Get events for task and its subtasks')
                .example('$0 activity --json', 'Output in JSON format with health indicators')
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
                         '- procrastination_critical: Average postpone >30 days');
        })
        .command('completed', 'Get completed tasks from Todoist', (yargs) => {
            return yargs
                .example('$0 completed', 'Get all completed tasks')
                .example('$0 completed --projectId "123456"', 'Get completed tasks for a specific project')
                .example('$0 completed --since "2024-01-01"', 'Get tasks completed since Jan 1st, 2024')
                .example('$0 completed --until "2024-03-31"', 'Get tasks completed until Mar 31st, 2024')
                .example('$0 completed --limit 10', 'Get last 10 completed tasks')
                .example('$0 completed --json', 'Output in JSON format')
                .options({
                    'projectId': {
                        description: 'Filter by project ID',
                        type: 'string'
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
                        description: 'Maximum number of tasks to return',
                        type: 'number'
                    },
                    'offset': {
                        description: 'Number of tasks to skip',
                        type: 'number'
                    },
                    'json': {
                        description: 'Output in JSON format',
                        type: 'boolean',
                        default: false
                    }
                });
        })
        .command('karma', 'Get karma statistics from Todoist', (yargs) => {
            return yargs
                .example('$0 karma', 'Get karma statistics')
                .example('$0 karma --json', 'Get karma statistics in JSON format')
                .options({
                    'json': {
                        description: 'Output in JSON format',
                        type: 'boolean',
                        default: false
                    }
                });
        })
        .command('report', 'Generate a comprehensive status report', (yargs) => {
            return yargs
                .example('$0 report', 'Generate a comprehensive status report')
                .example('$0 report --output report.html', 'Save the report to an HTML file')
                .options({
                    'output': {
                        description: 'Save the report to an HTML file',
                        type: 'string'
                    }
                });
        })
        .demandCommand(1, 'You must specify a command')
        .help()
        .argv;

    const api = await initializeApi();

    try {
        if (argv._[0] === 'activity') {
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
                                    section_events: groupedActivities.projects[projectId].sections[sectionId].section_events,
                                    items: {}
                                };
                            } else {
                                // Include section and its items
                                filteredGroups.projects[projectId].sections[sectionId] = groupedActivities.projects[projectId].sections[sectionId];
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

            // Fetch and cache projects before displaying output
            await fetchAndCacheProjects(api);

            // Add health indicators before output
            await addHealthIndicatorsToJson(finalOutput);

            if (argv.json) {
                // Output JSON format
                console.log(JSON.stringify(finalOutput, null, 2));
            } else {
                // Convert JSON to human-readable format
                console.log(formatTextOutput(finalOutput));
            }
        } else if (argv._[0] === 'completed') {
            const options = {
                projectId: argv.projectId,
                since: argv.since,
                until: argv.until,
                limit: argv.limit,
                offset: argv.offset
            };

            const completedData = await getCompleted(options);

            if (!completedData.items || completedData.items.length === 0) {
                console.log('No completed tasks found');
                return;
            }

            console.log(await formatCompletedOutput(completedData, argv.json));
        } else if (argv._[0] === 'karma') {
            const karmaData = await getKarmaStats();
            console.log(await formatKarmaOutput(karmaData, argv.json));
        } else if (argv._[0] === 'report') {
            const report = await generateReport();
            if (argv.output) {
                const fs = await import('fs/promises');
                await fs.writeFile(argv.output, report);
                console.log(`Report saved to ${argv.output}`);
            } else {
                console.log(report);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Function to get all events for a specific task
async function getAllEventsForTask(taskId) {
    const allEvents = [];
    let offset = 0;
    let hasMore = true;
    const seenEvents = new Set();
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second delay between retries

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    while (hasMore) {
        let success = false;
        let retryCount = 0;

        while (!success && retryCount < maxRetries) {
            try {
                const params = new URLSearchParams({
                    object_type: 'item',
                    object_id: taskId,
                    limit: '100',
                    offset: String(offset)
                });

                const response = await fetch(`${SYNC_ACTIVITY_URL}?${params.toString()}`, {
                    headers: {
                        'Authorization': `Bearer ${process.env.TODOIST_API_TOKEN}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch task events: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                
                // Process and deduplicate events
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
                        return true;
                    });

                allEvents.push(...processedEvents);
                
                // Check if we need to fetch more
                hasMore = data.events.length === 100;
                offset += data.events.length;
                success = true;
            } catch (error) {
                retryCount++;
                if (retryCount === maxRetries) {
                    console.error(`Failed to fetch events for task ${taskId} after ${maxRetries} retries:`, error.message);
                    return allEvents; // Return what we have so far
                }
                await delay(retryDelay * retryCount); // Exponential backoff
            }
        }
    }

    return allEvents;
}

main().catch(console.error); 
main().catch(console.error); 