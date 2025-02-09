const { TodoistApi } = require('@doist/todoist-api-typescript');

function getClient() {
    const token = process.env.TODOIST_API_TOKEN;
    if (!token) {
        console.error("Error: TODOIST_API_TOKEN environment variable is required");
        process.exit(1);
    }
    console.error("Debug: Initializing API with token length:", token.length);
    return new TodoistApi(token);
}

// Format project for display
function formatProject(project) {
    return `${project.id}\t${project.name}`;
}

module.exports = {
    getClient,
    formatProject
}; 