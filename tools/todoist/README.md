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
  --filter <query>     Use Todoist filter syntax (see examples below)
  --project <name|id>  Filter by project
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

## Task Command

The main command for managing tasks is `task`. It accepts both IDs and names, but using IDs is recommended for reliability.

### Basic Usage

```bash
task <subcommand> <task-id|query> [options]
```

Where:
- `<subcommand>` is one of: `update`, `move`, or `complete`
- `<task-id|query>` is either a task ID or content (ID recommended)
- `[options]` are specific to each subcommand

### Subcommands

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
# Using IDs (recommended)
task move 123456789 --project 987654321

# Using names (falls back to exact match)
task move "Task name" --project "Project name"

Options:
  --project <id|name>  Move to project
  --section <id|name>  Move to section
  --no-section       Remove from current section
  --parent <id|name>  Set parent task
  --no-parent       Remove parent (move to root)
  --json            Output in JSON format
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