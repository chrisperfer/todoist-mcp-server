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
- `activity` - View and analyze Todoist activity

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
  --taskIds "<ids>"       Task IDs to move (space-separated, quoted)
  --to-project-id "<id>"  Move to project
  --to-section-id "<id>"  Move to section
  --to-parent-id "<id>"   Move as subtask of parent
  --json                Output in JSON format

Examples:
# Move tasks to different locations
node tools/todoist/task.js batch-move --taskIds "12345" "67890" --to-project-id "2349336695"  # Move to project
node tools/todoist/task.js batch-move --taskIds "12345" "67890" --to-section-id "183758533"   # Move to section
node tools/todoist/task.js batch-move --taskIds "12345" "67890" --to-parent-id "8903766822"   # Move as subtasks

# Move tasks using find.js
node tools/todoist/find.js "overdue" --ids | xargs node tools/todoist/task.js batch-move --taskIds --to-project-id "2349336695"
node tools/todoist/find.js "p:FLOOBY & @test" --ids | xargs node tools/todoist/task.js batch-move --taskIds --to-section-id "183758533"
```

#### Batch Update Tasks
```bash
node tools/todoist/task.js batch-update [options]

Options:
  --taskIds "<ids>"       Task IDs to update (space-separated, quoted)
  --content "<text>"      New content
  --description "<text>"  New description
  --priority "<1-4>"      New priority
  --due-string "<text>"   New due date as text
  --due-date "<date>"     New due date (YYYY-MM-DD)
  --labels "<labels>"     Set labels (space-separated, quoted)
  --add-labels "<labels>" Add to existing labels
  --remove-labels "<l>"   Remove from existing labels
  --complete             Mark as complete
  --json                Output in JSON format

Examples:
# Basic updates
node tools/todoist/task.js batch-update --taskIds "12345" "67890" --content "Updated task name"
node tools/todoist/task.js batch-update --taskIds "12345" "67890" --priority 1 --labels "work" "urgent"
node tools/todoist/task.js batch-update --taskIds "12345" "67890" --due-string "tomorrow" --description "New description"

# Label management
node tools/todoist/task.js batch-update --taskIds "12345" "67890" --add-labels "work" "urgent"     # Add labels
node tools/todoist/task.js batch-update --taskIds "12345" "67890" --remove-labels "work" "urgent"  # Remove labels
node tools/todoist/task.js batch-update --taskIds "12345" "67890" --labels "work" "urgent"         # Set labels

# Task completion
node tools/todoist/task.js batch-update --taskIds "12345" "67890" --complete

# Updates using find.js
node tools/todoist/find.js "overdue" --ids | xargs node tools/todoist/task.js batch-update --taskIds --priority 1
node tools/todoist/find.js "p:FLOOBY & @test" --ids | xargs node tools/todoist/task.js batch-update --taskIds --labels "work" "urgent"
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
  --labels "<labels>"     Labels (space-separated, quoted)
  --json                Output in JSON format

Examples:
# Add tasks to inbox (default)
node tools/todoist/task.js batch-add --tasks "Task 1" "Task 2"

# Add tasks to a specific project
node tools/todoist/task.js batch-add --tasks "Project Task 1" "Project Task 2" --projectId "2349336695"

# Add tasks to a specific section
node tools/todoist/task.js batch-add --tasks "Section Task 1" "Section Task 2" --sectionId "183758533"

# Add tasks as subtasks
node tools/todoist/task.js batch-add --tasks "Subtask 1" "Subtask 2" --parentId "8903766822"

# Add tasks with full options
node tools/todoist/task.js batch-add \
  --tasks "Full Task 1" "Full Task 2" \
  --projectId "2349336695" \
  --sectionId "183758533" \
  --priority 1 \
  --labels "work" "urgent" \
  --due-string "tomorrow"
```

Notes:
- Tasks will be added to inbox if no location (project/section/parent) is specified
- When using sectionId, the tasks will inherit the section's project
- When using parentId, the tasks will inherit the parent's project and section
- Labels should be space-separated and quoted if they contain spaces

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

### Section Command

The unified command for all section operations:

```bash
node tools/todoist/section.js <subcommand> [options]
```

#### Add Section
```bash
node tools/todoist/section.js add [options]

Options:
  --name "<text>"       Section name (required)
  --projectId "<id>"    Project ID to add section to (required)
  --order "<number>"    Section order (optional)
  --json              Output in JSON format

Examples:
# Add section to project
node tools/todoist/section.js add "Planning 📋" --projectId "2349336695"

# Add section with specific order
node tools/todoist/section.js add "Sprint Backlog 📥" --projectId "2349336695" --order 1
```

#### Bulk Add Sections
```bash
node tools/todoist/section.js bulk-add [options]

Options:
  --names "<names>"     Section names (space-separated, use quotes)
  --projectId "<id>"    Project ID to add sections to (required)
  --startOrder "<n>"    Starting order (will increment for each section)
  --json              Output in JSON format

Examples:
# Add multiple sections
node tools/todoist/section.js bulk-add --names "Sprint 1 🏃" "Sprint 2 🏃" --projectId "2349336695"

# Add ordered sections
node tools/todoist/section.js bulk-add --names "Todo 📋" "In Progress 🔄" "Done ✅" --projectId "2349336695" --start-order 1
```

#### Update Section
```bash
node tools/todoist/section.js update [options]

Options:
  --section "<id>"     Section ID to update (required)
  --name "<text>"      New section name
  --projectId "<id>"   Move to project ID
  --order "<number>"   New section order
  --json             Output in JSON format

Examples:
# Update section name and order
node tools/todoist/section.js update --section "183758533" --name "Active Sprint 🏃" --order 1

# Move section to different project
node tools/todoist/section.js update --section "183758533" --projectId "2349336695"
```

#### Remove Section
```bash
node tools/todoist/section.js remove [options]

Options:
  --section "<id>"     Section ID to remove (required)
  --force             Force removal even if section contains tasks
  --json             Output in JSON format

Examples:
# Remove section and move tasks to project root
node tools/todoist/section.js remove --section "183758533" --force
```

#### Bulk Remove Sections
```bash
node tools/todoist/section.js bulk-remove [options]

Options:
  --sections "<ids>"   Section IDs to remove (space-separated)
  --force             Force removal even if sections contain tasks
  --continueOnError   Continue if some sections are not found
  --json             Output in JSON format

Examples:
# Remove multiple sections
node tools/todoist/section.js bulk-remove --sections "183758533" "183758534" --force
```

Notes:
- Section operations use the Sync API for better reliability
- Tasks in deleted sections are preserved by moving them to the project root
- Use --force to remove sections containing tasks
- Section IDs are recommended over names for more reliable targeting
- The order parameter determines section position (lower numbers appear first)
- When moving tasks between sections, task metadata is preserved

### Activity Command

The command for viewing and analyzing Todoist activity:

```bash
node tools/todoist/activity.js [options]

Options:
  --object-type <type>    Filter by object type (item, project, section, note)
  --object-id <id>        Filter by object ID
  --event-type <type>     Filter by event type (added, updated, completed, deleted, uncompleted, archived, unarchived)
  --projectId <id>        Filter to show only events for a specific project and optionally its contents
  --sectionId <id>        Filter to show only events for a specific section and optionally its tasks
  --taskId <id>          Filter to show only events for a specific task and optionally its subtasks
  --include-children     Include events for child items (sub-tasks, section tasks, or project contents)
  --since <date>         Start date (YYYY-MM-DD)
  --until <date>         End date (YYYY-MM-DD)
  --limit <n>            Maximum number of activities to return
  --include-deleted      Include deleted items in results
  --json                Output in JSON format with health indicators

Examples:
# View all activity
node tools/todoist/activity.js

# View completed tasks
node tools/todoist/activity.js --object-type item --event-type completed

# View project activity with children
node tools/todoist/activity.js --projectId "2349336695" --include-children

# View activity since date with health indicators
node tools/todoist/activity.js --since "2024-01-01" --json

Notes:
- Health indicators in JSON output:
  - idle_warning: No activity for >30 days
  - idle_critical: No activity for >90 days
  - procrastination_warning: Average postpone >7 days
  - procrastination_critical: Average postpone >30 days
- The --json option provides structured output with health analysis
- Use --include-children to see events for all nested items
- Can filter by project, section, or task (mutually exclusive)

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