#!/usr/bin/env node

async function testQuery(filterQuery) {
    const token = process.env.TODOIST_API_TOKEN;
    
    // Create a transient filter object
    const filterObject = {
        name: "Temporary Filter",
        query: filterQuery,
        color: 30,
        is_deleted: 0,
        is_favorite: 0
    };
    
    // Create request body with the filter object
    const requestBody = {
        sync_token: '*',
        resource_types: ['items'],
        filters: [filterObject]
    };
    
    console.log('\nTesting filter:', filterQuery);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    try {
        const response = await fetch('https://api.todoist.com/sync/v9/sync', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));
        
        if (data.items) {
            console.log(`Found ${data.items.length} tasks`);
            data.items.forEach(item => {
                console.log(`- [${item.id}] ${item.content} (project: ${item.project_id})`);
            });
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Test different filter syntaxes
const filters = [
    'p:Create',           // Using p: prefix
    '#Create',            // Using # prefix
    '##Create',           // Using ## prefix
    'project:Create',     // Using project: prefix
    '@Create'             // Using @ prefix
];

// Run tests sequentially
(async () => {
    for (const filter of filters) {
        await testQuery(filter);
    }
})(); 