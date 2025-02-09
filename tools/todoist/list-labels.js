#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';

async function listLabels(options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);
        
        try {
            // Get all personal labels and tasks
            const [labels, tasks] = await Promise.all([
                api.getLabels(),
                api.getTasks()
            ]);
            
            // Get shared labels if needed for the default view
            let sharedLabels = [];
            if (!options.json && !options.detailed) {
                sharedLabels = await api.getSharedLabels();
            }
            
            if (labels.length === 0 && sharedLabels.length === 0) {
                console.log("No labels found");
                return;
            }

            // Count tasks for each label
            const labelCounts = new Map();
            tasks.forEach(task => {
                if (task.labels) {
                    task.labels.forEach(labelName => {
                        labelCounts.set(labelName, (labelCounts.get(labelName) || 0) + 1);
                    });
                }
            });

            // Sort labels by name
            labels.sort((a, b) => a.name.localeCompare(b.name));

            // Separate goal labels from other labels
            const goalLabels = labels.filter(l => l.name.startsWith('Goals:'));
            const otherLabels = labels.filter(l => !l.name.startsWith('Goals:'));

            if (options.json) {
                // Add task count and metadata to each label object
                const labelsWithCounts = labels.map(label => ({
                    ...label,
                    taskCount: labelCounts.get(label.name) || 0,
                    isGoal: label.name.startsWith('Goals:'),
                    category: label.name.startsWith('Goals:') ? label.name.split(':')[1].trim() : null
                }));
                console.log(JSON.stringify(labelsWithCounts, null, 2));
                return;
            }

            if (options.detailed) {
                if (goalLabels.length > 0) {
                    console.log("\nLife Goals Labels:");
                    console.log("=================");
                    goalLabels.forEach(label => {
                        const taskCount = labelCounts.get(label.name) || 0;
                        const category = label.name.split(':')[1].trim();
                        console.log(`Goal Category: ${category}`);
                        console.log(`  ID: ${label.id}`);
                        console.log(`  Color: ${label.color}`);
                        console.log(`  Order: ${label.order}`);
                        console.log(`  Favorite: ${label.isFavorite ? 'Yes' : 'No'}`);
                        console.log(`  Active Tasks: ${taskCount}`);
                        console.log(''); // Empty line between labels
                    });
                }

                if (otherLabels.length > 0) {
                    console.log("\nOther Labels:");
                    console.log("=============");
                    otherLabels.forEach(label => {
                        console.log(`Label: ${label.name}`);
                        console.log(`  ID: ${label.id}`);
                        console.log(`  Color: ${label.color}`);
                        console.log(`  Order: ${label.order}`);
                        console.log(`  Favorite: ${label.isFavorite ? 'Yes' : 'No'}`);
                        console.log(`  Tasks: ${labelCounts.get(label.name) || 0}`);
                        console.log(''); // Empty line between labels
                    });
                }
                return;
            }

            // Default output: show both personal and shared labels
            if (labels.length > 0) {
                if (goalLabels.length > 0) {
                    console.log("\nLife Goals Labels:");
                    console.log("=================");
                    goalLabels.forEach(label => {
                        const favoriteStr = label.isFavorite ? ' ★' : '';
                        const colorStr = label.color !== 'charcoal' ? ` (${label.color})` : '';
                        const countStr = `[${labelCounts.get(label.name) || 0} tasks]`;
                        const category = label.name.split(':')[1].trim();
                        console.log(`${label.id}\t${category}${favoriteStr}${colorStr} ${countStr}`);
                    });
                }

                if (otherLabels.length > 0) {
                    console.log("\nOther Labels:");
                    console.log("=============");
                    otherLabels.forEach(label => {
                        const favoriteStr = label.isFavorite ? ' ★' : '';
                        const colorStr = label.color !== 'charcoal' ? ` (${label.color})` : '';
                        const countStr = `[${labelCounts.get(label.name) || 0} tasks]`;
                        console.log(`${label.id}\t${label.name}${favoriteStr}${colorStr} ${countStr}`);
                    });
                }
            }

            if (sharedLabels.length > 0) {
                console.log("\nShared Labels:");
                console.log("==============");
                const sharedGoalLabels = sharedLabels.filter(l => l.startsWith('Goals:'));
                const sharedOtherLabels = sharedLabels.filter(l => !l.startsWith('Goals:'));

                if (sharedGoalLabels.length > 0) {
                    console.log("\n  Life Goals:");
                    sharedGoalLabels
                        .sort((a, b) => a.localeCompare(b))
                        .forEach(label => {
                            const countStr = `[${labelCounts.get(label) || 0} tasks]`;
                            const category = label.split(':')[1].trim();
                            console.log(`\t${category} ${countStr}`);
                        });
                }

                if (sharedOtherLabels.length > 0) {
                    console.log("\n  Other:");
                    sharedOtherLabels
                        .sort((a, b) => a.localeCompare(b))
                        .forEach(label => {
                            const countStr = `[${labelCounts.get(label) || 0} tasks]`;
                            console.log(`\t${label} ${countStr}`);
                        });
                }
            }

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
    detailed: process.argv.includes('--detailed')
};

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    listLabels(options);
}

export { listLabels }; 