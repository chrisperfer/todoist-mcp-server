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

## Finding Tasks, Projects, and Sections

The list commands are your primary tools for discovering IDs:

### List Tasks
```bash
list-tasks [options]

Options:
  --filter <query>     Use Todoist filter syntax (recommended, see examples below)
  --projectId <id>     Filter tasks by project ID (numeric only)
  --label <label>     Filter by label (can be used multiple times)
  --json              Output in JSON format
  --detailed          Show detailed task information
```

### List Projects
```bash
list-projects [options]

Options:
  --json              Output in JSON format
```

### List Sections
```bash
list-sections [options]

Options:
  --project <name|id>  Show sections in specific project
  --json              Output in JSON format
```

### Using Todoist Filters

Filters are powerful queries to find exactly what you need. Some examples:

```bash
# Tasks due today in the Work project
list-tasks --filter "today & ##Work"

# High priority tasks with specific label
list-tasks --filter "p1 & @important"

# Overdue tasks in any project
list-tasks --filter "overdue"

# Tasks in a specific section
list-tasks --filter "##Project/Section"

# Complex combinations
list-tasks --filter "(today | overdue) & @important & ##Work"
```

For more filter syntax, see [Todoist's filter documentation](https://todoist.com/help/articles/205280588-search-and-filter).

### Project Filtering Best Practices

When filtering tasks by project, you have two options:

1. Using Todoist filter syntax (Recommended):
```bash
# Filter by project name (flexible, preferred method)
list-tasks --filter "p:Project Name"
list-tasks --filter "(p:Project1 | p:Project2) & @important"

# Complex project filters
list-tasks --filter "p:Work & !p:Work/Archive"
```

2. Using project ID:
```bash
# First find the project ID
list-projects
# Then filter by ID
list-tasks --projectId 123456789
```

The filter syntax is more powerful and flexible, supporting:
- Partial name matching
- Multiple projects
- Complex conditions
- Case-insensitive matching

## Task Command

The main command for managing tasks is `task`. It accepts both IDs and names, but using IDs is recommended for reliability.

### Basic Usage

```bash
task <subcommand> [options]
```

Where:
- `<subcommand>` is one of: `add`, `update`, `move`, or `complete`
- `[options]` are specific to each subcommand

### Subcommands

#### Add Task
```bash
task add <content> [options]

Where:
- <content> is the task content/description
- [options] can include:
  --to-project <id>    Add to project (root level)
  --to-parent <id>     Add under parent task (project implied)
  --priority <1-4>     Set task priority
  --due <string>       Set due date using natural language
  --date <YYYY-MM-DD>  Set specific due date
  --labels <labels>    Set comma-separated labels
  --json              Output in JSON format

Examples:
# Add task to project root
task add "New task" --to-project 987654321

# Add subtask (project inherited from parent)
task add "Subtask" --to-parent 123456789

# Add task with additional details
task add "Important task" --to-project 987654321 --priority 1 --due "tomorrow" --labels "important,work"
```

Note: The destination hierarchy is enforced:
- When adding under a parent task, the project is implied by the parent
- Only one destination can be specified (--to-project or --to-parent)
- Tasks cannot be directly added to sections (create in project then move)

#### Update Task
```bash
# Using ID (recommended)
task update 123456789 --content "New content"

# Using content (falls back to exact match)
task update "Task name" --content "New content"

Options:
  --content <text>          Update task content
  --description <text>      Update task description
  --priority <1-4>         Set task priority
  --labels <label1,label2>  Set task labels
  --add-labels <labels>     Add labels to existing ones
  --remove-labels <labels>  Remove specific labels
  --due-string <string>     Set due date using natural language
  --due-date <YYYY-MM-DD>   Set specific due date
  --json                    Output in JSON format
```

#### Move Task
```bash
task move <task> --to-[destination-type] <id>

Where:
- <task> is the task ID or content to move
- destination-type is one of: project, section, or parent
- <id> is the ID of the destination

Examples:
# Move task to root of a project
task move 123456789 --to-project 987654321

# Move task to a section (project is implied)
task move 123456789 --to-section 456789123

# Move task under another task (project and section are implied)
task move 123456789 --to-parent 789123456
```

Note: The destination hierarchy is strictly enforced:
- When moving to a parent task, both project and section are implied by the parent
- When moving to a section, the project is implied by the section
- When moving to a project, the task is placed at the root level
- Only one destination can be specified (--to-project, --to-section, or --to-parent)

### Batch Move Tasks
```bash
task batch-move <filter> --to-[destination-type] <id>

Where:
- <filter> is a Todoist filter query (e.g. "##Project" or "@label")
- destination-type is one of: project, section, or parent
- <id> is the ID of the destination

Examples:
# Move all tasks from FLOOBY project to Technical Debt section
task batch-move "##FLOOBY" --to-section 172860480

# Move all high priority tasks to a project
task batch-move "p1" --to-project 987654321

# Move all tasks with a label under a parent task
task batch-move "@waiting" --to-parent 123456789
```

The same destination hierarchy rules apply to batch moves as to single task moves.

### Finding IDs

To find the IDs needed for move operations:

```bash
# Find task IDs
list-tasks --filter "your search"

# Find project IDs
list-projects

# Find section IDs
list-sections --project <project-id>

# Search for any type
search task "search term"
search project "search term"
search section "search term"
```

#### Complete Task
```bash
# Using ID (recommended)
task complete 123456789

# Using content (falls back to exact match)
task complete "Task name"

Options:
  --json            Output in JSON format
```

#### Batch Label Tasks
```bash
task batch-label <filter> [options]

Options:
  --labels <labels>        Set labels for all matching tasks
  --add-labels <labels>    Add labels to existing ones
  --remove-labels <labels> Remove specific labels
  --json                   Output in JSON format

Examples:
# Set labels for all tasks in FLOOBY project
task batch-label "##FLOOBY" --labels "flooby,important"

# Add labels to all tasks in a section
task batch-label "##FLOOBY/Section" --add-labels "urgent,high-priority"

# Remove labels from all tasks with a specific label
task batch-label "@old-label" --remove-labels "old-label"
```

### Examples

First, find the relevant IDs:
```bash
# Find task ID
list-tasks --filter "##Work & @important"
# Output: 123456789    Important task (p1, [Work], @important)

# Find project ID
list-projects
# Output: 987654321    Work

# Then use IDs for operations
task move 123456789 --project 987654321
task update 123456789 --priority 1
task complete 123456789
```

Using filters to find related items:
```bash
# Find all tasks in a project to get its ID
list-tasks --filter "##SomeProject"

# Find all subtasks of a parent
list-tasks --filter "parent: 123456789"

# Find tasks in a section
list-tasks --filter "##Project/Section"
```

## Legacy Commands

The individual `update-task.js` and `move-task.js` scripts are maintained for backward compatibility but will be deprecated in future versions. Please migrate to the unified `task` command. 