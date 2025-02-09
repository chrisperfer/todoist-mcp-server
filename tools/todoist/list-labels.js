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
            // Get all personal labels
            const labels = await api.getLabels();
            
            // Get shared labels if needed for the default view
            let sharedLabels = [];
            if (!options.json && !options.detailed) {
                sharedLabels = await api.getSharedLabels();
            }
            
            if (labels.length === 0 && sharedLabels.length === 0) {
                console.log("No labels found");
                return;
            }

            // Sort labels by name
            labels.sort((a, b) => a.name.localeCompare(b.name));

            if (options.json) {
                console.log(JSON.stringify(labels, null, 2));
                return;
            }

            if (options.detailed) {
                labels.forEach(label => {
                    console.log(`Label: ${label.name}`);
                    console.log(`  ID: ${label.id}`);
                    console.log(`  Color: ${label.color}`);
                    console.log(`  Order: ${label.order}`);
                    console.log(`  Favorite: ${label.isFavorite ? 'Yes' : 'No'}`);
                    console.log(''); // Empty line between labels
                });
                return;
            }

            // Default output: show both personal and shared labels
            if (labels.length > 0) {
                console.log("\nPersonal Labels:");
                labels.forEach(label => {
                    const favoriteStr = label.isFavorite ? ' ★' : '';
                    const colorStr = label.color !== 'charcoal' ? ` (${label.color})` : '';
                    console.log(`${label.id}\t${label.name}${favoriteStr}${colorStr}`);
                });
            }

            if (sharedLabels.length > 0) {
                console.log("\nShared Labels:");
                sharedLabels
                    .sort((a, b) => a.localeCompare(b))
                    .forEach(label => {
                        console.log(`\t${label}`);
                    });
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