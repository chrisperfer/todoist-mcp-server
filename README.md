# Todoist MCP Server

An MCP (Model Context Protocol) server implementation that integrates Claude with Todoist, enabling natural language task management. This server allows Claude to interact with your Todoist tasks using everyday language.

## Features

* **Natural Language Task Management**: Create, update, complete, and delete tasks using everyday language
* **Enhanced List Commands**: Unified `list` command for tasks, projects, and sections with detailed views and JSON output
* **Smart Task Search**: Find tasks using partial name matches and Todoist query syntax
* **Flexible Filtering**: Filter tasks by due date, priority, project, and other attributes
* **Rich Task Details**: Support for descriptions, due dates, priority levels, and notes
* **Project Management**: View project hierarchies, sections, and associated tasks
* **Sync API Integration**: Reliable data retrieval with support for batch operations
* **Intuitive Error Handling**: Clear feedback for better user experience

## Installation

```bash
npm install -g @abhiz123/todoist-mcp-server
```

## Tools

### todoist:list
Unified command for listing tasks, projects, and sections:

#### List Tasks
```bash
# Basic task listing with filters
npm run todoist:list tasks
npm run todoist:list tasks --filter "today"
npm run todoist:list tasks --filter "p:Work & !p:Work/Archive"

# Get detailed task information
npm run todoist:list tasks --taskId 123456789

# Common task filters
npm run todoist:list tasks --filter "overdue"
npm run todoist:list tasks --filter "priority 4"
npm run todoist:list tasks --filter "@Goals: Growth & !@Next"
```

#### List Projects
```bash
# List all projects
npm run todoist:list projects

# Filter projects by name
npm run todoist:list projects --filter "FLOOBY"

# Get detailed project information
npm run todoist:list projects --projectId 123456789 --data  # Include tasks, sections, notes
npm run todoist:list projects --projectId 123456789 --info  # Include only project info and notes
```

#### List Sections
```bash
# List all sections
npm run todoist:list sections

# Filter sections by project
npm run todoist:list sections --filter "p:FLOOBY"

# Filter sections by name
npm run todoist:list sections --filter "Meeting"
```

### todoist:add-task
Create new tasks with various attributes:
* Required: content (task title)
* Optional: description, due date, priority level (1-4)
* Example: `npm run todoist:add-task -- --content "Team Meeting" --description "Weekly sync" --due tomorrow`

### todoist:update-task
Update existing tasks:
* Find tasks by ID or content
* Update any task attribute
* Example: `npm run todoist:update-task -- --task 123456789 --due "next Monday"`

### todoist:move-task
Move tasks between projects and sections:
* Use task ID for reliable targeting
* Example: `npm run todoist:move-task -- --task 123456789 --project "Work" --section "Planning"`

### todoist_get_tasks
Retrieve and filter tasks:
* Filter by due date, priority, or project
* Natural language date filtering
* Optional result limit
* Example: "Show high priority tasks due this week"

### todoist_update_task
Update existing tasks using natural language search:
* Find tasks by partial name match
* Update any task attribute (content, description, due date, priority)
* Example: "Update meeting task to be due next Monday"

### todoist_complete_task
Mark tasks as complete using natural language search:
* Find tasks by partial name match
* Confirm completion status
* Example: "Mark the documentation task as complete"

### todoist_delete_task
Remove tasks using natural language search:
* Find and delete tasks by name
* Confirmation messages
* Example: "Delete the PR review task"

## Setup

### Getting a Todoist API Token
1. Log in to your Todoist account
2. Navigate to Settings → Integrations
3. Find your API token under "Developer"

### Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "todoist": {
      "command": "npx",
      "args": ["-y", "@abhiz123/todoist-mcp-server"],
      "env": {
        "TODOIST_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

## Example Usage

### Listing and Filtering
```bash
# List tasks due today
npm run todoist:list tasks --filter "today"

# Get detailed project information
npm run todoist:list projects --projectId 123456789 --data

# List sections in a project
npm run todoist:list sections --filter "p:Work"
```

### Task Management
```bash
# Create a new task
npm run todoist:add-task -- --content "Review PR" --due "tomorrow at 2pm"

# Update a task
npm run todoist:update-task -- --task 123456789 --priority 4

# Move a task
npm run todoist:move-task -- --task 123456789 --project "Work" --section "In Progress"
```

## Development

### Building from source
```