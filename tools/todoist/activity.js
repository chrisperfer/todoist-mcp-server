#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
    initializeApi,
    formatJsonOutput
} from './lib/task-utils.js';

// Sync API endpoint for activity
const SYNC_ACTIVITY_URL = 'https://api.todoist.com/sync/v9/activity/get';

function cleanEventData(event, removeParentId = false) {
    // Create a new object with only the fields we want
    const cleaned = {
        event_type: event.event_type,
        object_type: event.object_type,
        object_id: event.object_id,
        event_date: event.event_date
    };

    // Only include parent IDs if they're not redundant due to nesting
    if (!removeParentId) {
        if (event.parent_project_id) cleaned.parent_project_id = event.parent_project_id;
        if (event.parent_id) cleaned.parent_id = event.parent_id;
    }

    // Include all extra_data fields for health calculations
    if (event.extra_data) {
        cleaned.extra_data = { ...event.extra_data };
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

    console.log('\nCalculating health for events:', events.length);
    console.log('Raw events:', JSON.stringify(events, null, 2));
    
    const now = new Date();
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
        console.log('Processing event:', {
            type: event.event_type,
            date: event.event_date,
            due_date: dueDate,
            extra_data: event.extra_data
        });
        
        if (dueDate) {
            if (lastDueDate) {
                const oldDate = new Date(lastDueDate);
                const newDate = new Date(dueDate);
                if (newDate > oldDate) {
                    indicators.due_date_changes++;
                    indicators.total_postponed_days += Math.floor((newDate - oldDate) / (1000 * 60 * 60 * 24));
                    console.log('Found due date change:', {
                        old: lastDueDate,
                        new: dueDate,
                        days_postponed: Math.floor((newDate - oldDate) / (1000 * 60 * 60 * 24))
                    });
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

    console.log('Calculated health indicators:', indicators);
    return indicators;
}

// Add health indicators to an item structure
function addHealthIndicators(itemStructure) {
    if (!itemStructure) return itemStructure;

    console.log('\nAdding health indicators to item:', {
        has_events: !!itemStructure.item_events,
        event_count: itemStructure.item_events?.length,
        has_sub_items: !!itemStructure.sub_items,
        sub_item_count: Object.keys(itemStructure.sub_items || {}).length
    });

    // Add health indicators to the current item
    if (itemStructure.item_events && itemStructure.item_events.length > 0) {
        itemStructure.health = calculateHealthIndicators(itemStructure.item_events);
        console.log('Added health indicators:', itemStructure.health);
    }

    // Recursively add health indicators to sub-items
    if (itemStructure.sub_items) {
        Object.values(itemStructure.sub_items).forEach(subItem => {
            addHealthIndicators(subItem);
        });
    }

    return itemStructure;
}

function groupActivities(events) {
    console.log('\n=== Starting groupActivities ===');
    console.log('Total events:', events?.length);
    console.log('Event types:', events?.map(e => e.object_type).filter((v, i, a) => a.indexOf(v) === i));

    const groups = {
        projects: {},
        other_events: []
    };

    if (!events) return groups;

    // First pass: Create project structure and collect all events
    console.log('\nFirst pass: Creating project structure');
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
            console.log('Created project structure for:', projectId);
        }

        // Add project events to their structure
        if (event.object_type === 'project') {
            console.log('Found project event:', {
                event_type: event.event_type,
                project_id: event.object_id,
                extra_data: event.extra_data
            });
            const eventProjectId = String(event.object_id);
            if (!groups.projects[eventProjectId]) {
                groups.projects[eventProjectId] = {
                    project_events: [],
                    sections: {},
                    items: {},
                    comments: [],
                    child_projects: {}
                };
                console.log('Created project structure for:', eventProjectId);
            }
            groups.projects[eventProjectId].project_events.push(cleanEventData(event));
        }
    });

    // Second pass: Establish project hierarchy
    console.log('\nSecond pass: Establishing project hierarchy');
    events.forEach(event => {
        if (event.object_type === 'project' && event.extra_data?.parent_id) {
            console.log('Found project with parent:', {
                project_id: event.object_id,
                parent_id: event.extra_data.parent_id
            });
            const projectId = String(event.object_id);
            const parentProjectId = String(event.extra_data.parent_id);
            
            if (groups.projects[parentProjectId] && groups.projects[projectId]) {
                // Move project to its parent's child_projects
                groups.projects[parentProjectId].child_projects[projectId] = groups.projects[projectId];
                delete groups.projects[projectId];
                console.log('Moved project to parent:', {
                    project_id: projectId,
                    parent_id: parentProjectId
                });
            }
        }
    });

    // Log project structure before third pass
    console.log('\nProject structure before third pass:', {
        project_ids: Object.keys(groups.projects),
        project_count: Object.keys(groups.projects).length
    });

    // Third pass: Handle sections, items, and comments
    events.forEach(event => {
        if (event.object_type === 'section') {
            const projectId = String(event.parent_project_id);
            if (projectId && groups.projects[projectId]) {
                const sectionId = String(event.object_id);
                if (!groups.projects[projectId].sections[sectionId]) {
                    groups.projects[projectId].sections[sectionId] = {
                        section_events: [],
                        items: {}
                    };
                }
                groups.projects[projectId].sections[sectionId].section_events.push(cleanEventData(event, true));
            } else {
                groups.other_events.push(cleanEventData(event));
            }
        } else if (event.object_type === 'item') {
            console.log('\nProcessing item event:', {
                event_type: event.event_type,
                object_id: event.object_id,
                parent_project_id: event.parent_project_id,
                parent_id: event.parent_id,
                section_id: event.extra_data?.section_id
            });
            
            const projectId = String(event.parent_project_id);
            if (projectId) {
                let targetProject = groups.projects[projectId];
                console.log('Found target project:', !!targetProject);
                
                // If project not found at root, search in child_projects
                if (!targetProject) {
                    console.log('Searching in child projects...');
                    for (const rootProject of Object.values(groups.projects)) {
                        const findProject = (proj) => {
                            if (proj.child_projects[projectId]) {
                                targetProject = proj.child_projects[projectId];
                                return true;
                            }
                            for (const childProj of Object.values(proj.child_projects)) {
                                if (findProject(childProj)) return true;
                            }
                            return false;
                        };
                        if (findProject(rootProject)) {
                            console.log('Found project in child projects');
                            break;
                        }
                    }
                }

                if (targetProject) {
                    const itemId = String(event.object_id);
                    const sectionId = event.extra_data?.section_id ? String(event.extra_data.section_id) : undefined;
                    const parentItemId = event.parent_id ? String(event.parent_id) : undefined;

                    console.log('Adding item to project:', {
                        itemId,
                        sectionId,
                        parentItemId,
                        isSubItem: !!parentItemId,
                        inSection: !!sectionId
                    });

                    // Function to create item structure
                    const createItemStructure = () => ({
                        item_events: [],
                        comments: [],
                        sub_items: {}
                    });

                    if (parentItemId) {
                        // This is a sub-item
                        const findParentItem = (items) => {
                            if (items[parentItemId]) {
                                if (!items[parentItemId].sub_items[itemId]) {
                                    items[parentItemId].sub_items[itemId] = createItemStructure();
                                }
                                items[parentItemId].sub_items[itemId].item_events.push(cleanEventData(event, true));
                                return true;
                            }
                            // Search in sub_items recursively
                            for (const item of Object.values(items)) {
                                if (findParentItem(item.sub_items)) return true;
                            }
                            return false;
                        };

                        // Search in both project items and section items
                        let found = findParentItem(targetProject.items);
                        if (!found) {
                            for (const section of Object.values(targetProject.sections)) {
                                if (findParentItem(section.items)) {
                                    found = true;
                                    break;
                                }
                            }
                        }

                        if (!found) {
                            groups.other_events.push(cleanEventData(event));
                        }
                    } else if (sectionId && targetProject.sections[sectionId]) {
                        // Item belongs to a section
                        if (!targetProject.sections[sectionId].items[itemId]) {
                            targetProject.sections[sectionId].items[itemId] = createItemStructure();
                        }
                        targetProject.sections[sectionId].items[itemId].item_events.push(cleanEventData(event, true));
                    } else {
                        // Item belongs directly to the project
                        if (!targetProject.items[itemId]) {
                            targetProject.items[itemId] = createItemStructure();
                        }
                        targetProject.items[itemId].item_events.push(cleanEventData(event, true));
                        console.log('Added item event to project items');
                    }
                } else {
                    console.log('No target project found, adding to other_events');
                    groups.other_events.push(cleanEventData(event));
                }
            } else {
                console.log('No parent project ID, adding to other_events');
                groups.other_events.push(cleanEventData(event));
            }
        } else if (event.object_type === 'comment') {
            const projectId = event.parent_project_id;
            const parentId = event.parent_id;

            if (projectId) {
                let targetProject = groups.projects[projectId];
                // If project not found at root, search in child_projects
                if (!targetProject) {
                    for (const rootProject of Object.values(groups.projects)) {
                        const findProject = (proj) => {
                            if (proj.child_projects[projectId]) {
                                targetProject = proj.child_projects[projectId];
                                return true;
                            }
                            for (const childProj of Object.values(proj.child_projects)) {
                                if (findProject(childProj)) return true;
                            }
                            return false;
                        };
                        if (findProject(rootProject)) break;
                    }
                }

                if (targetProject) {
                    if (parentId) {
                        // Comment belongs to an item
                        const findItemAndAddComment = (items) => {
                            if (items[parentId]) {
                                items[parentId].comments.push(cleanEventData(event, true));
                                return true;
                            }
                            // Search in sub_items recursively
                            for (const item of Object.values(items)) {
                                if (findItemAndAddComment(item.sub_items)) return true;
                            }
                            return false;
                        };

                        // Search in both project items and section items
                        let found = findItemAndAddComment(targetProject.items);
                        if (!found) {
                            for (const section of Object.values(targetProject.sections)) {
                                if (findItemAndAddComment(section.items)) {
                                    found = true;
                                    break;
                                }
                            }
                        }

                        if (!found) {
                            groups.other_events.push(cleanEventData(event));
                        }
                    } else {
                        // Comment belongs to the project
                        targetProject.comments.push(cleanEventData(event, true));
                    }
                } else {
                    groups.other_events.push(cleanEventData(event));
                }
            } else {
                groups.other_events.push(cleanEventData(event));
            }
        } else {
            groups.other_events.push(cleanEventData(event));
        }
    });

    // After all items are grouped, add health indicators
    console.log('\n=== Adding health indicators ===');
    console.log('Number of projects:', Object.keys(groups.projects).length);
    
    Object.values(groups.projects).forEach(project => {
        console.log('\nProcessing project items:', Object.keys(project.items).length);
        // Add health indicators to direct items
        Object.keys(project.items).forEach(itemId => {
            console.log('Adding health indicators to item:', itemId);
            project.items[itemId] = addHealthIndicators(project.items[itemId]);
        });

        console.log('\nProcessing project sections:', Object.keys(project.sections).length);
        // Add health indicators to items in sections
        Object.values(project.sections).forEach(section => {
            console.log('Processing section items:', Object.keys(section.items).length);
            Object.keys(section.items).forEach(itemId => {
                console.log('Adding health indicators to section item:', itemId);
                section.items[itemId] = addHealthIndicators(section.items[itemId]);
            });
        });

        console.log('\nProcessing child projects:', Object.keys(project.child_projects).length);
        // Add health indicators to items in child projects
        Object.values(project.child_projects).forEach(childProject => {
            console.log('Processing child project items:', Object.keys(childProject.items).length);
            Object.keys(childProject.items).forEach(itemId => {
                console.log('Adding health indicators to child project item:', itemId);
                childProject.items[itemId] = addHealthIndicators(childProject.items[itemId]);
            });
            
            console.log('Processing child project sections:', Object.keys(childProject.sections).length);
            Object.values(childProject.sections).forEach(section => {
                console.log('Processing child project section items:', Object.keys(section.items).length);
                Object.keys(section.items).forEach(itemId => {
                    console.log('Adding health indicators to child project section item:', itemId);
                    section.items[itemId] = addHealthIndicators(section.items[itemId]);
                });
            });
        });
    });

    return groups;
}

function addHealthIndicatorsToJson(structure) {
    console.log('\nAdding health indicators to structure');

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

async function getActivity(api, options = {}) {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
        throw new Error("TODOIST_API_TOKEN environment variable is required");
    }

    // First, get project events to ensure we have project structure
    const projectEvents = [];
    let offset = 0;
    let hasMore = true;

    console.log('\nFetching project events...');
    while (hasMore) {
        // Build query parameters for project events
        const projectQueryParams = new URLSearchParams();
        projectQueryParams.append('object_type', 'project');
        if (options.since) projectQueryParams.append('since', options.since);
        if (options.until) projectQueryParams.append('until', options.until);
        projectQueryParams.append('limit', '50');
        projectQueryParams.append('offset', offset.toString());
        
        const response = await fetch(`${SYNC_ACTIVITY_URL}?${projectQueryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (!result || !result.events) {
            throw new Error("No response from Activity API");
        }

        projectEvents.push(...result.events);
        console.log(`Fetched ${result.events.length} project events (offset: ${offset})`);
        
        hasMore = result.events.length === 50;
        offset += result.events.length;
    }

    // Now get the requested events
    const events = [];
    offset = 0;
    hasMore = true;

    console.log('\nFetching requested events...');
    while (hasMore) {
        // Build query parameters
        const queryParams = new URLSearchParams();
        if (options.objectType) queryParams.append('object_type', options.objectType);
        if (options.objectId) queryParams.append('object_id', options.objectId);
        if (options.eventType) queryParams.append('event_type', options.eventType);
        if (options.parentProjectId) queryParams.append('parent_project_id', options.parentProjectId);
        if (options.parentId) queryParams.append('parent_id', options.parentId);
        if (options.since) queryParams.append('since', options.since);
        if (options.until) queryParams.append('until', options.until);
        queryParams.append('limit', '50');
        queryParams.append('offset', offset.toString());
        
        // By default, exclude deleted items unless explicitly included
        if (!options.includeDeleted) {
            queryParams.append('exclude_deleted', '1');
        }

        const response = await fetch(`${SYNC_ACTIVITY_URL}?${queryParams.toString()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        if (!result || !result.events) {
            throw new Error("No response from Activity API");
        }

        events.push(...result.events);
        console.log(`Fetched ${result.events.length} events (offset: ${offset})`);
        
        // If we got less than the limit or hit our requested limit, stop
        hasMore = result.events.length === 50 && (!options.limit || events.length < options.limit);
        offset += result.events.length;
    }

    // Combine project events with other events, removing duplicates
    const seenEvents = new Set();
    const allEvents = [...projectEvents, ...events].filter(event => {
        const eventKey = `${event.object_type}-${event.object_id}-${event.event_type}-${event.event_date}`;
        if (seenEvents.has(eventKey)) return false;
        seenEvents.add(eventKey);
        return true;
    });

    return {
        events: allEvents,
        count: allEvents.length
    };
}

async function main() {
    const argv = yargs(hideBin(process.argv))
        .usage('Usage: $0 [options]')
        .example('$0', 'Get all activity (excluding deleted items)')
        .example('$0 --object-type task --event-type completed', 'Get task completion activity')
        .example('$0 --parent-project-id "2349336695" --limit 10', 'Get last 10 activities in project')
        .example('$0 --since "2024-01-01" --until "2024-03-31"', 'Get activity in date range')
        .example('$0 --include-deleted', 'Include deleted items in results')
        .options({
            'object-type': {
                description: 'Filter by object type (task, project, section, etc)',
                type: 'string'
            },
            'object-id': {
                description: 'Filter by object ID',
                type: 'string'
            },
            'event-type': {
                description: 'Filter by event type (added, updated, completed, etc)',
                type: 'string'
            },
            'parent-project-id': {
                description: 'Filter by parent project ID',
                type: 'string'
            },
            'parent-id': {
                description: 'Filter by parent ID',
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
                description: 'Output in JSON format',
                type: 'boolean',
                default: false
            }
        })
        .help()
        .argv;

    const api = await initializeApi();

    try {
        const options = {
            objectType: argv.objectType,
            objectId: argv.objectId,
            eventType: argv.eventType,
            parentProjectId: argv.parentProjectId,
            parentId: argv.parentId,
            since: argv.since,
            until: argv.until,
            limit: argv.limit,
            offset: argv.offset,
            includeDeleted: argv.includeDeleted
        };

        const activities = await getActivity(api, options);

        if (argv.json) {
            const groupedActivities = groupActivities(activities.events);
            const output = {
                ...groupedActivities,
                total_count: activities.count
            };
            // Add health indicators to the grouped structure
            addHealthIndicatorsToJson(output);
            console.log(JSON.stringify(output, null, 2));
        } else {
            if (!activities.events || activities.events.length === 0) {
                console.log('No activities found');
                return;
            }

            const groups = groupActivities(activities.events);
            
            // Print projects
            for (const projectId in groups.projects) {
                const project = groups.projects[projectId];
                console.log(`\n=== Project ${projectId} ===`);
                
                if (project.project_events.length > 0) {
                    console.log('\nProject Events:');
                    project.project_events.forEach(event => {
                        console.log(`  - [${event.event_date}] ${event.event_type}`);
                        if (event.extra_data) {
                            console.log(`    ${JSON.stringify(event.extra_data, null, 2)}`);
                        }
                    });
                }

                if (project.comments.length > 0) {
                    console.log('\nProject Comments:');
                    project.comments.forEach(comment => {
                        console.log(`  - [${comment.event_date}] ${comment.event_type}`);
                        if (comment.extra_data) {
                            console.log(`    ${JSON.stringify(comment.extra_data, null, 2)}`);
                        }
                    });
                }

                if (Object.keys(project.items).length > 0) {
                    console.log('\nItems:');
                    for (const itemId in project.items) {
                        const item = project.items[itemId];
                        console.log(`\n  Item ${itemId}:`);
                        
                        item.item_events.forEach(event => {
                            console.log(`    - [${event.event_date}] ${event.event_type}`);
                            if (event.extra_data) {
                                console.log(`      ${JSON.stringify(event.extra_data, null, 2)}`);
                            }
                        });

                        if (item.comments.length > 0) {
                            console.log('    Comments:');
                            item.comments.forEach(comment => {
                                console.log(`      - [${comment.event_date}] ${comment.event_type}`);
                                if (comment.extra_data) {
                                    console.log(`        ${JSON.stringify(comment.extra_data, null, 2)}`);
                                }
                            });
                        }
                    }
                }
            }

            // Print other events
            if (groups.other_events.length > 0) {
                console.log('\n=== Other Events ===');
                groups.other_events.forEach(event => {
                    console.log(`\n- ${event.object_type} event:`);
                    console.log(`  Type: ${event.event_type}`);
                    console.log(`  Date: ${event.event_date}`);
                    if (event.extra_data) {
                        console.log(`  Data: ${JSON.stringify(event.extra_data, null, 2)}`);
                    }
                });
            }

            if (activities.count) {
                console.log(`\nTotal activities: ${activities.count}`);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main().catch(console.error); 