# Todoist Task Management Tools

A set of command-line tools for managing Todoist tasks.

## Setup

1. Set your Todoist API token in the environment:
```bash
export TODOIST_API_TOKEN=your_api_token_here
```

2. Ensure you have Node.js installed and run:
```bash
npm install
```

## Core Commands

The tools have been consolidated into three main commands plus utilities:

- `list` - List and filter tasks, projects, and sections
- `task` - Manage tasks (add, update, move, batch operations)
- `project` - Manage projects (add, update, bulk operations)
- `workflow` - Process sequential thoughts

### List Command

The unified command for viewing tasks, projects, and sections:

```bash
node tools/todoist/list.js <subcommand> [options]
```

#### List Tasks
```bash
node tools/todoist/list.js tasks [options]

Options:
  --filter "<query>"   Filter tasks using Todoist query syntax
  --taskId "<id>"     Get detailed information for a specific task
  --json             Output in JSON format

Examples:
# Basic task listing with filters
node tools/todoist/list.js tasks --filter "today"
node tools/todoist/list.js tasks --filter "#FLOOBY 🐒"
node tools/todoist/list.js tasks --filter "overdue"
node tools/todoist/list.js tasks --filter "priority 4"
node tools/todoist/list.js tasks --filter "no date & !@waiting"
node tools/todoist/list.js tasks --filter "due before: +7 days"
node tools/todoist/list.js tasks --filter "@Goals: Growth & !@Next"

# Get detailed task information
node tools/todoist/list.js tasks --taskId 123456789 --json
```

#### List Projects
```bash
node tools/todoist/list.js projects [options]

Options:
  --filter "<text>"    Filter projects by name
  --projectId "<id>"   Get detailed information for a specific project
  --data              Include tasks, sections, and notes with --projectId
  --info              Include only project info and notes with --projectId
  --json             Output in JSON format

Examples:
# List all projects
node tools/todoist/list.js projects

# Filter projects by name (include emojis if present)
node tools/todoist/list.js projects --filter "FLOOBY 🐒"

# Get detailed project information
node tools/todoist/list.js projects --projectId 123456789 --data
```

#### List Sections
```bash
node tools/todoist/list.js sections [options]

Options:
  --filter "<filter>"   Filter sections by name or project
  --projectId "<id>"    Filter sections by project ID
  --json              Output in JSON format

Examples:
# List all sections
node tools/todoist/list.js sections

# Filter sections by project (include emojis if present)
node tools/todoist/list.js sections --filter "p:FLOOBY 🐒"

# Filter sections by name
node tools/todoist/list.js sections --filter "Meeting"
```

### Task Command

The unified command for all task operations:

```bash
node tools/todoist/task.js <subcommand> [options]
```

#### Add Task
```bash
node tools/todoist/task.js add [options]

Options:
  --content "<text>"      Task content (required)
  --project "<id/name>"   Project to add task to
  --section "<id/name>"   Section to add task to
  --parent "<id>"         Parent task ID for subtask
  --priority "<1-4>"      Task priority
  --due-string "<text>"   Due date as text (e.g., "tomorrow")
  --due-date "<date>"     Due date (YYYY-MM-DD)
  --labels "<labels>"     Comma-separated list of labels
  --json                 Output in JSON format

Examples:
# Add task to project
node tools/todoist/task.js add --content "New task" --project "FLOOBY 🐒"

# Add task with details
node tools/todoist/task.js add --content "Important task" --priority 1 --due-string "tomorrow" --labels "urgent,work"
```

#### Batch Add Tasks
```bash
node tools/todoist/task.js batch-add [options]

Options:
  --tasks "<tasks>"       Task contents (space-separated, use quotes)
  --project "<id/name>"   Project to add tasks to
  --section "<id/name>"   Section to add tasks to
  [Same options as single add]

Example:
node tools/todoist/task.js batch-add --tasks "Task 1" "Task 2" "Task 3" --project "FLOOBY 🐒"
```

#### Move Task
```bash
node tools/todoist/task.js move [options]

Options:
  --task "<id/content>"   Task to move (required)
  --to-project "<id>"     Move to project
  --to-section "<id>"     Move to section
  --to-parent "<id>"      Move as subtask of parent
  --json                 Output in JSON format

Example:
node tools/todoist/task.js move --task 123456789 --to-project 987654321
```

#### Batch Move Tasks
```bash
node tools/todoist/task.js batch-move [options]

Options:
  --filter "<query>"      Tasks to move (required)
  --to-project "<id>"     Move to project
  --to-section "<id>"     Move to section
  --to-parent "<id>"      Move as subtask of parent
  --json                 Output in JSON format

Example:
node tools/todoist/task.js batch-move --filter "#FLOOBY 🐒" --to-section 172860480
```

#### Update Task
```bash
node tools/todoist/task.js update [options]

Options:
  --task "<id/content>"   Task to update (required)
  --content "<text>"      New content
  --description "<text>"  New description
  --priority "<1-4>"      New priority
  --due-string "<text>"   New due date as text
  --due-date "<date>"     New due date (YYYY-MM-DD)
  --labels "<labels>"     Set labels (comma-separated)
  --add-labels "<labels>" Add to existing labels
  --remove-labels "<l>"   Remove from existing labels
  --complete             Mark as complete
  --json                Output in JSON format

Example:
node tools/todoist/task.js update --task 123456789 --priority 1 --due-string "tomorrow"
```

### Project Command

The unified command for all project operations:

```bash
node tools/todoist/project.js <subcommand> [options]
```

#### Add Project
```bash
node tools/todoist/project.js add [options]

Options:
  --name "<text>"        Project name (required)
  --parentId "<id>"      Parent project ID
  --color "<color>"      Project color
  --view "<style>"       View style (list/board)
  --favorite            Set as favorite
  --json               Output in JSON format

Example:
node tools/todoist/project.js add --name "New Project 📁" --color "blue" --favorite
```

#### Bulk Add Projects
```bash
node tools/todoist/project.js bulk-add [options]

Options:
  --names "<names>"      Project names (use quotes for multi-word names)
  [Same options as single add]

Example:
node tools/todoist/project.js bulk-add --names "Project 1 📁" "Project 2 📁" --color "blue"
```

#### Update Project
```bash
node tools/todoist/project.js update [options]

Options:
  --project "<id/name>"  Project to update (required)
  --name "<text>"       New name
  --parentId "<id>"     New parent project ID
  --color "<color>"     New color
  --view "<style>"      New view style
  --favorite           Toggle favorite status
  --json              Output in JSON format

Example:
node tools/todoist/project.js update --project "Old Name" --name "New Name 📁" --color "red"
```

### Utility Commands

#### Workflow Tool
```bash
node tools/todoist/workflow-tool.js [options]

Options:
  JSON input with thought structure
  --waitSeconds <n>      Pause duration between thoughts
  --branchId "<id>"      Branch identifier for parallel paths
```

## Best Practices

1. Always use IDs instead of content/names when possible for more reliable targeting
2. Use 'list projects' to verify project IDs and structure before creating new projects
3. Use 'list sections' to verify section existence before creating or moving tasks
4. Project names are case-sensitive and must match exactly (including emojis)
5. When creating sections, verify the project exists first to avoid duplicate projects
6. When filtering by project name, include any emojis that are part of the project name 