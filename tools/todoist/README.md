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

#### Find Tasks
```bash
node tools/todoist/find.js <filter> [options]

Options:
  --ids                Output task IDs in format suitable for batch commands
  --json              Output in JSON format with enhanced task information

Examples:
# Basic task finding
node tools/todoist/find.js "p:FLOOBY & @test"     # Find tasks in FLOOBY project with @test label
node tools/todoist/find.js "today | tomorrow"      # Find tasks due today or tomorrow
node tools/todoist/find.js "search: meeting"       # Find tasks containing "meeting"
node tools/todoist/find.js "@work & p:FLOOBY"     # Find work-labeled tasks in FLOOBY project

# Integration with batch commands
node tools/todoist/find.js "overdue" --ids | xargs node tools/todoist/task.js batch-update --taskIds --priority 1
node tools/todoist/find.js "p:FLOOBY & @test" --ids | xargs node tools/todoist/task.js batch-move --taskIds --to-section-id 789
node tools/todoist/find.js "no labels" --json > unlabeled-tasks.json     # Export tasks to JSON file

Notes:
- For filter syntax, see: https://todoist.com/help/articles/205280588-search-and-filter
- Default output shows task content, project path, section name, parent task, and labels
- The --ids option outputs IDs in a format ready for batch commands
- The --json option includes project paths and section names in the output
- Cannot use both --ids and --json options together
```

#### Batch Move Tasks
```bash
node tools/todoist/task.js batch-move [options]

Options:
  --taskIds "<ids>"       Task IDs to move (comma-separated or from find.js)
  --to-project-id "<id>"  Move to project
  --to-section-id "<id>"  Move to section
  --to-parent-id "<id>"   Move as subtask of parent
  --json                Output in JSON format

Examples:
# Move tasks directly by ID
node tools/todoist/task.js batch-move --taskIds 123,456 --to-section-id 789

# Move tasks using find.js
node tools/todoist/find.js "p:FLOOBY & search:Batch" --ids | xargs node tools/todoist/task.js batch-move --taskIds --to-section-id 789
node tools/todoist/find.js "overdue" --ids | xargs node tools/todoist/task.js batch-move --taskIds --to-project-id 123
```

#### Batch Update Tasks
```bash
node tools/todoist/task.js batch-update [options]

Options:
  --taskIds "<ids>"       Task IDs to update (comma-separated or from find.js)
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

Examples:
# Update tasks directly by ID
node tools/todoist/task.js batch-update --taskIds 123,456 --priority 1

# Update tasks using find.js
node tools/todoist/find.js "overdue" --ids | xargs node tools/todoist/task.js batch-update --taskIds --priority 1
node tools/todoist/find.js "p:FLOOBY & search:Batch" --ids | xargs node tools/todoist/task.js batch-update --taskIds --labels "work,urgent"
```

#### Batch Add Tasks
```bash
node tools/todoist/task.js batch-add [options]

Options:
  --tasks "<tasks>"       Task contents (space-separated, use quotes)
  --projectId "<id>"      Project to add tasks to
  --sectionId "<id>"      Section to add tasks to
  --parentId "<id>"       Parent task ID for subtasks
  --priority "<1-4>"      Task priority
  --due-string "<text>"   Due date as text
  --due-date "<date>"     Due date (YYYY-MM-DD)
  --labels "<labels>"     Comma-separated list of labels
  --json                Output in JSON format

Examples:
node tools/todoist/task.js batch-add --tasks "Task 1" "Task 2" "Task 3" --projectId 123 --priority 3
node tools/todoist/task.js batch-add --tasks "Section Task 1" "Section Task 2" --sectionId 789 --labels "work"
node tools/todoist/task.js batch-add --tasks "Subtask 1" "Subtask 2" --parentId 456 --due-string "tomorrow"
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
7. Use find.js with batch commands for efficient bulk operations
8. Keep filter queries simple and specific for better reliability
9. Use --json output for programmatic processing or data export
10. Verify task IDs before performing batch operations 