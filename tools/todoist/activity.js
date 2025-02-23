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

    // Include extra_data but filter out v2_* properties
    if (event.extra_data) {
        cleaned.extra_data = Object.fromEntries(
            Object.entries(event.extra_data)
                .filter(([key]) => !key.startsWith('v2_'))
        );
        // Only include extra_data if it's not empty
        if (Object.keys(cleaned.extra_data).length === 0) {
            delete cleaned.extra_data;
        }
    }

    return cleaned;
}

function groupActivities(events) {
    const groups = {
        projects: {},
        other_events: []
    };

    if (!events) return groups;

    events.forEach(event => {
        if (event.object_type === 'project') {
            // Handle project events
            const projectId = event.object_id;
            if (!groups.projects[projectId]) {
                groups.projects[projectId] = {
                    project_events: [],
                    items: {},
                    comments: []
                };
            }
            groups.projects[projectId].project_events.push(cleanEventData(event));
        } else if (event.object_type === 'item') {
            // Handle item events
            const projectId = event.parent_project_id;
            if (projectId) {
                if (!groups.projects[projectId]) {
                    groups.projects[projectId] = {
                        project_events: [],
                        items: {},
                        comments: []
                    };
                }
                const itemId = event.object_id;
                if (!groups.projects[projectId].items[itemId]) {
                    groups.projects[projectId].items[itemId] = {
                        item_events: [],
                        comments: []
                    };
                }
                // Remove parent_project_id since it's redundant in the hierarchy
                groups.projects[projectId].items[itemId].item_events.push(cleanEventData(event, true));
            } else {
                groups.other_events.push(cleanEventData(event));
            }
        } else if (event.object_type === 'comment') {
            // Handle comment events
            if (event.parent_project_id) {
                const projectId = event.parent_project_id;
                if (!groups.projects[projectId]) {
                    groups.projects[projectId] = {
                        project_events: [],
                        items: {},
                        comments: []
                    };
                }
                // Remove parent_project_id since it's redundant in the hierarchy
                groups.projects[projectId].comments.push(cleanEventData(event, true));
            } else if (event.parent_id) {
                // Try to find the parent item's project
                let found = false;
                for (const projectId in groups.projects) {
                    for (const itemId in groups.projects[projectId].items) {
                        if (itemId === event.parent_id) {
                            // Remove both parent IDs since they're redundant in the hierarchy
                            groups.projects[projectId].items[itemId].comments.push(cleanEventData(event, true));
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
                if (!found) {
                    groups.other_events.push(cleanEventData(event));
                }
            } else {
                groups.other_events.push(cleanEventData(event));
            }
        } else {
            groups.other_events.push(cleanEventData(event));
        }
    });

    return groups;
}

async function getActivity(api, options = {}) {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
        throw new Error("TODOIST_API_TOKEN environment variable is required");
    }

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (options.objectType) queryParams.append('object_type', options.objectType);
    if (options.objectId) queryParams.append('object_id', options.objectId);
    if (options.eventType) queryParams.append('event_type', options.eventType);
    if (options.parentProjectId) queryParams.append('parent_project_id', options.parentProjectId);
    if (options.parentId) queryParams.append('parent_id', options.parentId);
    if (options.since) queryParams.append('since', options.since);
    if (options.until) queryParams.append('until', options.until);
    if (options.limit) queryParams.append('limit', options.limit);
    if (options.offset) queryParams.append('offset', options.offset);
    
    // By default, exclude deleted items unless explicitly included
    if (!options.includeDeleted) {
        queryParams.append('exclude_deleted', '1');
    }

    // Make request to activity endpoint
    const response = await fetch(`${SYNC_ACTIVITY_URL}?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const result = await response.json();
    if (!result) {
        throw new Error("No response from Activity API");
    }

    return result;
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