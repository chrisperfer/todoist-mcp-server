#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOOLS_DIR = join(__dirname, '..', 'tools', 'todoist');

// Define Resource interface
interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  content: string;
}

// Test resource for todoist_find
const TEST_RESOURCES: Record<string, Resource> = {
  "todoist_find/secret": {
    uri: "todoist_find/secret",
    name: "Secret Number",
    description: "A test resource containing a secret number",
    mimeType: "text/plain",
    content: "The secret number is 10"
  },
  "todoist_find/help": {
    uri: "todoist_find/help",
    name: "Todoist Find Help",
    description: "Help documentation and examples for the todoist_find tool",
    mimeType: "text/markdown",
    content: `# Todoist Find Tool Help

## Overview
The find tool allows you to search and filter Todoist tasks using powerful query syntax.

## Basic Usage
\`\`\`
todoist_find "your_query"  # Basic search
todoist_find "your_query" --json  # Get detailed JSON output
todoist_find "your_query" --ids   # Get task IDs for batch operations
\`\`\`

## Query Syntax Examples
- Find tasks in a project: \`p:ProjectName\`
- Find tasks with a label: \`@label\`
- Find tasks due today: \`today\`
- Find overdue tasks: \`overdue\`
- Find tasks without a date: \`no date\`
- Find tasks without labels: \`no labels\`
- Text search: \`search:meeting\`

## Combining Filters
- AND operator: \`p:ProjectName & @label\`
- OR operator: \`today | tomorrow\`
- Complex queries: \`p:Work & @important & search:meeting\`

## Common Use Cases
1. Find all tasks in FLOOBY project with test label:
   \`todoist_find "p:FLOOBY & @test"\`

2. Get IDs of all overdue tasks for batch update:
   \`todoist_find "overdue" --ids\`

3. Find tasks due this week with detailed info:
   \`todoist_find "due: today .. 7 days" --json\`

4. Search across all projects:
   \`todoist_find "search:important meeting"\`

## Best Practices
- Use quotes around queries with spaces or special characters
- Use --ids flag when planning batch operations
- Use --json flag when you need detailed task information
- Combine multiple conditions for precise filtering
- Test complex queries in parts before combining

## Tips
- Queries are case-insensitive
- Use parentheses for complex logical grouping
- The search: prefix does partial word matching
- Label queries work with or without the @ symbol
- Project queries work with or without the p: prefix`
  },
  "todoist_list/help": {
    uri: "todoist_list/help",
    name: "Todoist List Help",
    description: "Help documentation and examples for the todoist_list tools",
    mimeType: "text/markdown",
    content: `# Todoist List Tools Help

## Overview
The list tools provide commands for listing and filtering tasks, projects, and sections in your Todoist workspace.

## Commands
- \`tasks\`: List and filter tasks
- \`projects\`: List and filter projects
- \`sections\`: List and filter sections

## Global Options
- \`--json\`: Output in JSON format
- \`--help\`: Show help message

## Task Listing
### Options
- \`--filter <filter>\`: Use Todoist filter query (e.g., "today", "#Project 📁")
- \`--taskId <id>\`: Get detailed information for a specific task

### Examples
\`\`\`bash
list tasks --filter "today"
list tasks --filter "#FLOOBY 🐒"  # Include emoji if project has one
list tasks --filter "p:Work & !p:Work/Archive"
list tasks --taskId 123456789
\`\`\`

## Project Listing
### Options
- \`--filter <text>\`: Filter projects by name
- \`--projectId <id>\`: Get detailed information for a specific project
- \`--data\`: Include tasks, sections, and notes (use with --projectId)
- \`--info\`: Include only project info and notes (use with --projectId)

### Examples
\`\`\`bash
list projects --filter "FLOOBY 🐒"  # Include emoji if project has one
list projects --projectId 123456789 --data
list projects --projectId 123456789 --info
\`\`\`

## Section Listing
### Options
- \`--projectId <id>\`: Filter sections by project ID
- \`--filter <filter>\`: Filter sections by name or project

### Examples
\`\`\`bash
list sections --filter "p:FLOOBY 🐒"  # Include emoji if project has one
list sections --filter "Meeting"
\`\`\`

## Important Notes
- When filtering by project name, include any emojis that are part of the project name
- Use \`--json\` flag for programmatic access to data
- Project and section IDs are more reliable than names for targeting
- Combine filters for more precise results
- The filter syntax follows Todoist's query format`
  },
  "todoist_section/help": {
    uri: "todoist_section/help",
    name: "Todoist Section Help",
    description: "Help documentation and examples for the todoist_section tools",
    mimeType: "text/markdown",
    content: `# Todoist Section Tools Help

## Overview
The section tools allow you to manage sections within your Todoist projects, including adding, updating, and removing sections.

## Commands

### Add Section
Add a new section to a project.

\`\`\`bash
section add "Planning 📋" --projectId "2349336695"
section add "Sprint Backlog 📥" --projectId "2349336695" --order 1
\`\`\`

#### Options
- \`name\`: Section name (required)
- \`--projectId\`: Project ID to add section to (required)
- \`--order\`: Section order (optional)
- \`--json\`: Output in JSON format

### Bulk Add Sections
Add multiple sections to a project at once.

\`\`\`bash
section bulk-add --names "Sprint 1 🏃" "Sprint 2 🏃" --projectId "2349336695"
section bulk-add --names "Todo 📋" "In Progress 🔄" "Done ✅" --projectId "2349336695" --start-order 1
\`\`\`

#### Options
- \`--names\`: Section names (space-separated, use quotes for multi-word names)
- \`--projectId\`: Project ID to add sections to (required)
- \`--startOrder\`: Starting order for sections (will increment for each section)
- \`--json\`: Output in JSON format

### Update Section
Update an existing section's properties.

\`\`\`bash
section update "183758533" --name "Active Sprint 🏃" --order 1
section update "183758533" --projectId "2349336695"
\`\`\`

#### Options
- \`section\`: Section ID to update (required)
- \`--name\`: New section name
- \`--projectId\`: Move to project ID
- \`--order\`: New section order
- \`--json\`: Output in JSON format

### Remove Section
Remove a section from a project.

\`\`\`bash
section remove --section "183758533" --force
\`\`\`

#### Options
- \`--section\`: Section ID to remove (required)
- \`--force\`: Force removal even if section contains tasks
- \`--json\`: Output in JSON format

### Bulk Remove Sections
Remove multiple sections at once.

\`\`\`bash
section bulk-remove --sections "183758533" "183758534" --force
\`\`\`

#### Options
- \`--sections\`: Section IDs to remove (space-separated)
- \`--force\`: Force removal even if sections contain tasks
- \`--continueOnError\`: Continue if some sections are not found
- \`--json\`: Output in JSON format

## Important Notes
- Section operations use the Sync API for better reliability
- Tasks in deleted sections are preserved by moving them to the project root
- Use --force to remove sections containing tasks
- Section IDs are recommended over names for more reliable targeting
- The order parameter determines section position (lower numbers appear first)
- When moving tasks between sections, task metadata is preserved`
  },
  "todoist_status/help": {
    uri: "todoist_status/help",
    name: "Todoist Status Help",
    description: "Help documentation and examples for the todoist_status tools",
    mimeType: "text/markdown",
    content: `# Todoist Status Tools Help

## Overview
The status tools provide insights into your Todoist productivity and task completion metrics, including karma statistics and completed tasks analysis.

## Commands

### Karma Statistics
View your karma score and productivity trends.

\`\`\`bash
status karma
status karma --json  # Get detailed statistics in JSON format
\`\`\`

#### Features
- View current karma score
- Track daily and weekly goals
- Monitor productivity streaks
- Analyze karma trends
- View life goals distribution

### Completed Tasks
View and analyze completed tasks with filtering options.

\`\`\`bash
status completed
status completed --since "2024-01-01" --until "2024-03-31"
status completed --projectId "2349336695"
status completed --json  # Get life goals statistics
\`\`\`

#### Options
- \`--projectId\`: Filter by project ID
- \`--since\`: Start date (YYYY-MM-DD)
- \`--until\`: End date (YYYY-MM-DD)
- \`--limit\`: Maximum number of tasks to return
- \`--offset\`: Number of tasks to skip
- \`--json\`: Output in JSON format with life goals statistics

## Life Goals Tracking
The status tools help monitor your progress across different life areas:

- Tasks are categorized by life goals based on project names
- View completion percentages by life goal
- Track task distribution across life areas
- Monitor goal achievement rates
- Note: Inbox tasks are excluded from life goals stats

## Best Practices
1. Regular Review
   - Check karma stats daily for momentum
   - Review completed tasks weekly
   - Monitor life goals distribution monthly
   - Track productivity streaks

2. Data Analysis
   - Use date filters for specific periods
   - Compare completion rates across projects
   - Analyze task distribution patterns
   - Use JSON output for detailed analysis

3. Goal Setting
   - Set realistic daily and weekly goals
   - Balance tasks across life areas
   - Monitor streak information
   - Adjust goals based on trends

## Tips
- Use date ranges to analyze specific periods
- Compare completion rates across projects
- Monitor life goals distribution regularly
- Track karma trends for productivity insights
- Use JSON output for data analysis and reporting`
  },
  "todoist_task/help": {
    uri: "todoist_task/help",
    name: "Todoist Task Help",
    description: "Help documentation and examples for the todoist_task tools",
    mimeType: "text/markdown",
    content: `# Todoist Task Tools Help

## Overview
The task tools provide comprehensive functionality for managing tasks in Todoist, including adding, updating, moving, and batch operations.

## Commands

### Add Task
Add a new task to Todoist.

\`\`\`bash
task add --content "Review project plan 📋" --projectId "2349336695"
task add --content "Weekly meeting" --description "Team sync-up" --due-string "every monday at 10am" --priority 3
\`\`\`

#### Options
- \`--content\`: Task content (required)
- \`--description\`: Task description
- \`--projectId\`: Project ID to add task to
- \`--sectionId\`: Section ID to add task to
- \`--parentId\`: Parent task ID for subtasks
- \`--priority\`: Task priority (1-4)
- \`--due-string\`: Due date as text
- \`--due-date\`: Due date (YYYY-MM-DD)
- \`--labels\`: Labels (space-separated)
- \`--json\`: Output in JSON format

### Batch Add Tasks
Add multiple tasks at once.

\`\`\`bash
task batch-add --tasks "Task 1" "Task 2" "Task 3" --projectId "2349336695"
task batch-add --tasks "Sprint planning" "Team review" --due-string "next monday" --labels "meeting team"
\`\`\`

#### Options
- \`--tasks\`: Task contents (space-separated, use quotes)
- \`--projectId\`: Project to add tasks to
- \`--sectionId\`: Section to add tasks to
- \`--parentId\`: Parent task ID for subtasks
- \`--priority\`: Task priority (1-4)
- \`--due-string\`: Due date as text
- \`--due-date\`: Due date (YYYY-MM-DD)
- \`--labels\`: Labels (space-separated)
- \`--json\`: Output in JSON format

### Update Task
Update an existing task's properties.

\`\`\`bash
task update --taskId "1234567890" --content "Updated task name" --priority 4
task update --taskId "1234567890" --add-labels "important urgent" --due-string "tomorrow"
\`\`\`

#### Options
- \`--taskId\`: Task ID to update (required)
- \`--content\`: New content
- \`--description\`: New description
- \`--priority\`: New priority (1-4)
- \`--due-string\`: New due date as text
- \`--due-date\`: New due date (YYYY-MM-DD)
- \`--labels\`: Set labels (space-separated)
- \`--add-labels\`: Add to existing labels
- \`--remove-labels\`: Remove from existing labels
- \`--complete\`: Mark as complete
- \`--json\`: Output in JSON format

### Batch Update Tasks
Update multiple tasks at once.

\`\`\`bash
task batch-update --taskIds "123 456 789" --priority 4 --add-labels "urgent"
task batch-update --taskIds "123 456 789" --complete true
\`\`\`

#### Options
- \`--taskIds\`: Task IDs to update (space-separated)
- \`--content\`: New content
- \`--description\`: New description
- \`--priority\`: New priority (1-4)
- \`--due-string\`: New due date as text
- \`--due-date\`: New due date (YYYY-MM-DD)
- \`--labels\`: Set labels (space-separated)
- \`--add-labels\`: Add to existing labels
- \`--remove-labels\`: Remove from existing labels
- \`--complete\`: Mark as complete
- \`--json\`: Output in JSON format

### Batch Move Tasks
Move multiple tasks to a new project, section, or parent task.

\`\`\`bash
task batch-move --taskIds "123 456 789" --to-project-id "2349336695"
task batch-move --taskIds "123 456 789" --to-section-id "12345"
\`\`\`

#### Options
- \`--taskIds\`: Task IDs to move (space-separated)
- \`--to-project-id\`: Move to project
- \`--to-section-id\`: Move to section
- \`--to-parent-id\`: Move as subtask of parent
- \`--json\`: Output in JSON format

## Best Practices
1. Task Creation
   - Use clear, actionable task names
   - Add relevant details in descriptions
   - Set appropriate priorities
   - Use consistent labeling
   - Organize with sections and projects

2. Batch Operations
   - Use find.js to get task IDs
   - Test updates on single tasks first
   - Verify results after batch operations
   - Use --json for detailed feedback
   - Keep task metadata consistent

3. Task Organization
   - Use parent-child relationships
   - Leverage sections for grouping
   - Maintain consistent labeling
   - Set realistic due dates
   - Use priorities effectively

## Tips
- Use IDs instead of names for reliability
- Combine with find.js for complex operations
- Verify changes after batch updates
- Keep consistent naming conventions
- Use emojis for visual organization
- Leverage the Sync API's capabilities`
  },
  "todoist_note/help": {
    uri: "todoist_note/help",
    name: "Todoist Note Help",
    description: "Help documentation and examples for the todoist_note tools",
    mimeType: "text/markdown",
    content: `# Todoist Note Tools Help

## Overview
The note tools provide functionality for adding notes (comments) to tasks and projects in Todoist, including batch operations for adding the same note to multiple items.

## Commands

### Add Note
Add a note to a task or project.

\`\`\`bash
note add --taskId "8908564449" --content "Important information about this task"
note add --projectId "2349336695" --content "Project status update: on track"
note add "Task name" --content "Note content"  # Find by name
\`\`\`

#### Options
- \`--taskId\`: Task ID to add note to
- \`--projectId\`: Project ID to add note to
- \`--content\`: Note content (required)
- \`--json\`: Output in JSON format

### Batch Add Notes to Tasks
Add the same note to multiple tasks at once.

\`\`\`bash
note batch-add --taskIds "8908564449" "8908564458" --content "This applies to all these tasks"
\`\`\`

#### Options
- \`--taskIds\`: Task IDs to add note to (space-separated)
- \`--content\`: Note content (required)
- \`--json\`: Output in JSON format

### Batch Add Notes to Projects
Add the same note to multiple projects at once.

\`\`\`bash
note batch-add-project --projectIds "2349336695" "2349336696" --content "Status update for all projects"
\`\`\`

#### Options
- \`--projectIds\`: Project IDs to add note to (space-separated)
- \`--content\`: Note content (required)
- \`--json\`: Output in JSON format

## Important Notes
- Notes are added using the Sync API for better reliability and performance
- When adding notes to multiple items, all operations are batched in a single API call
- Task and project IDs are more reliable than names for targeting
- The script can find tasks and projects by name if IDs are not provided
- Use --json flag for programmatic access to data

## Best Practices
1. Note Creation
   - Keep notes concise and focused
   - Use clear formatting for readability
   - Include relevant context in each note
   - Consider using emojis for visual organization

2. Batch Operations
   - Use find.js to get task IDs for batch operations
   - Verify results after batch operations
   - Use --json for detailed feedback
   - Keep note content consistent across related items

3. Finding Items
   - Use IDs whenever possible for reliability
   - When searching by name, use unique identifiers
   - Combine with list.js to find specific items
   - Verify the correct items are targeted before adding notes

## Tips
- Notes can be used for status updates, clarifications, or additional context
- Batch operations are more efficient than individual API calls
- The Sync API ensures consistent and reliable note creation
- Use JSON output for integration with other tools or scripts`
  }
};

// Helper function to execute tool and return JSON result
async function executeTool(toolPath: string, args: string[] = [], useJson: boolean = false): Promise<any> {
  return new Promise((resolve, reject) => {
    // Add --json flag if specified
    if (useJson) {
      args.push('--json');
    }
    
    console.error(`Executing: node ${toolPath} ${args.join(' ')}`);
    
    const childProcess: ChildProcess = spawn('node', [toolPath, ...args], {
      env: { ...process.env, TODOIST_API_TOKEN: process.env.TODOIST_API_TOKEN }
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`Tool execution failed: ${stderr}`));
        return;
      }
      
      if (useJson) {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          console.error('Failed to parse JSON:', e);
          resolve(stdout.trim());
        }
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Define tools based on the core Todoist scripts
const TOOLS: Tool[] = [
  // Find tool
  {
    name: "todoist_find",
    description: "Find tasks using Todoist filters with advanced querying capabilities",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Todoist filter query (e.g., 'p:ProjectName & @label', 'today | tomorrow', 'overdue')" },
        ids: { type: "boolean", description: "Output task IDs in format suitable for batch commands" },
        json: { type: "boolean", description: "Output in JSON format with enhanced task information" }
      },
      required: ["filter"]
    }
  },
  
  // List tools
  {
    name: "todoist_list_tasks",
    description: "List and filter tasks from Todoist",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter tasks using Todoist query syntax" },
        taskId: { type: "string", description: "Get detailed information for a specific task" },
        json: { type: "boolean", description: "Output in JSON format" }
      }
    }
  },
  {
    name: "todoist_list_projects",
    description: "List and filter projects from Todoist",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter projects by name" },
        projectId: { type: "string", description: "Get detailed information for a specific project" },
        data: { type: "boolean", description: "Include tasks, sections, and notes with --projectId" },
        info: { type: "boolean", description: "Include only project info and notes with --projectId" },
        json: { type: "boolean", description: "Output in JSON format" }
      }
    }
  },
  {
    name: "todoist_list_sections",
    description: "List and filter sections from Todoist",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter sections by name or project" },
        projectId: { type: "string", description: "Filter sections by project ID" },
        json: { type: "boolean", description: "Output in JSON format" }
      }
    }
  },
  
  // Task tools
  {
    name: "todoist_task_add",
    description: "Add a new task to Todoist",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Task content" },
        description: { type: "string", description: "Task description" },
        projectId: { type: "string", description: "Project ID to add task to" },
        sectionId: { type: "string", description: "Section ID to add task to" },
        parentId: { type: "string", description: "Parent task ID for subtasks" },
        priority: { type: "string", description: "Task priority (1-4)" },
        "due-string": { type: "string", description: "Due date as text" },
        "due-date": { type: "string", description: "Due date (YYYY-MM-DD)" },
        labels: { type: "string", description: "Labels (space-separated)" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["content"]
    }
  },
  {
    name: "todoist_task_batch_add",
    description: "Add multiple tasks to Todoist in batch",
    inputSchema: {
      type: "object",
      properties: {
        tasks: { type: "string", description: "Task contents (space-separated, use quotes)" },
        projectId: { type: "string", description: "Project to add tasks to" },
        sectionId: { type: "string", description: "Section to add tasks to" },
        parentId: { type: "string", description: "Parent task ID for subtasks" },
        priority: { type: "string", description: "Task priority (1-4)" },
        "due-string": { type: "string", description: "Due date as text" },
        "due-date": { type: "string", description: "Due date (YYYY-MM-DD)" },
        labels: { type: "string", description: "Labels (space-separated)" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["tasks"]
    }
  },
  {
    name: "todoist_task_update",
    description: "Update an existing task in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to update" },
        content: { type: "string", description: "New content" },
        description: { type: "string", description: "New description" },
        priority: { type: "string", description: "New priority (1-4)" },
        "due-string": { type: "string", description: "New due date as text" },
        "due-date": { type: "string", description: "New due date (YYYY-MM-DD)" },
        labels: { type: "string", description: "Set labels (space-separated)" },
        "add-labels": { type: "string", description: "Add to existing labels" },
        "remove-labels": { type: "string", description: "Remove from existing labels" },
        complete: { type: "boolean", description: "Mark as complete" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["taskId"]
    }
  },
  {
    name: "todoist_task_batch_update",
    description: "Update multiple tasks in Todoist in batch",
    inputSchema: {
      type: "object",
      properties: {
        taskIds: { type: "string", description: "Task IDs to update (space-separated)" },
        content: { type: "string", description: "New content" },
        description: { type: "string", description: "New description" },
        priority: { type: "string", description: "New priority (1-4)" },
        "due-string": { type: "string", description: "New due date as text" },
        "due-date": { type: "string", description: "New due date (YYYY-MM-DD)" },
        labels: { type: "string", description: "Set labels (space-separated)" },
        "add-labels": { type: "string", description: "Add to existing labels" },
        "remove-labels": { type: "string", description: "Remove from existing labels" },
        complete: { type: "boolean", description: "Mark as complete" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["taskIds"]
    }
  },
  {
    name: "todoist_task_batch_move",
    description: "Move multiple tasks in Todoist in batch",
    inputSchema: {
      type: "object",
      properties: {
        taskIds: { type: "string", description: "Task IDs to move (space-separated)" },
        "to-project-id": { type: "string", description: "Move to project" },
        "to-section-id": { type: "string", description: "Move to section" },
        "to-parent-id": { type: "string", description: "Move as subtask of parent" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["taskIds"]
    }
  },
  
  // Project tools
  {
    name: "todoist_project_add",
    description: "Add a new project to Todoist",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name (required)" },
        parentId: { type: "string", description: "Parent project ID" },
        color: { type: "string", description: "Project color" },
        view: { type: "string", description: "View style (list/board)" },
        favorite: { type: "boolean", description: "Set as favorite" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["name"]
    }
  },
  {
    name: "todoist_project_bulk_add",
    description: "Add multiple projects to Todoist",
    inputSchema: {
      type: "object",
      properties: {
        names: { type: "string", description: "Project names (space-separated, use quotes)" },
        parentId: { type: "string", description: "Parent project ID" },
        color: { type: "string", description: "Project color" },
        view: { type: "string", description: "View style (list/board)" },
        favorite: { type: "boolean", description: "Set as favorite" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["names"]
    }
  },
  {
    name: "todoist_project_update",
    description: "Update an existing project in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project to update (ID or name)" },
        name: { type: "string", description: "New name" },
        parentId: { type: "string", description: "New parent project ID" },
        color: { type: "string", description: "New color" },
        view: { type: "string", description: "New view style" },
        favorite: { type: "boolean", description: "Toggle favorite status" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["project"]
    }
  },
  
  // Section tools
  {
    name: "todoist_section_add",
    description: "Add a new section to a project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Section name (required)" },
        projectId: { type: "string", description: "Project ID to add section to (required)" },
        order: { type: "string", description: "Section order (optional)" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["name", "projectId"]
    }
  },
  {
    name: "todoist_section_bulk_add",
    description: "Add multiple sections to a project",
    inputSchema: {
      type: "object",
      properties: {
        names: { type: "string", description: "Section names (space-separated, use quotes)" },
        projectId: { type: "string", description: "Project ID to add sections to (required)" },
        startOrder: { type: "string", description: "Starting order (will increment for each section)" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["names", "projectId"]
    }
  },
  {
    name: "todoist_section_update",
    description: "Update an existing section",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Section ID to update (required)" },
        name: { type: "string", description: "New section name" },
        projectId: { type: "string", description: "Move to project ID" },
        order: { type: "string", description: "New section order" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["section"]
    }
  },
  {
    name: "todoist_section_remove",
    description: "Remove a section from a project",
    inputSchema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Section ID to remove (required)" },
        force: { type: "boolean", description: "Force removal even if section contains tasks" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["section"]
    }
  },
  {
    name: "todoist_section_bulk_remove",
    description: "Remove multiple sections from a project",
    inputSchema: {
      type: "object",
      properties: {
        sections: { type: "string", description: "Section IDs to remove (space-separated)" },
        force: { type: "boolean", description: "Force removal even if sections contain tasks" },
        continueOnError: { type: "boolean", description: "Continue if some sections are not found" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["sections"]
    }
  },
  
  // Status tools
  {
    name: "todoist_status_karma",
    description: "View karma statistics and life goals breakdown",
    inputSchema: {
      type: "object",
      properties: {
        json: { type: "boolean", description: "Output in JSON format with detailed statistics" }
      }
    }
  },
  {
    name: "todoist_status_completed",
    description: "View completed tasks with life goals statistics",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Filter by project ID" },
        since: { type: "string", description: "Start date (YYYY-MM-DD)" },
        until: { type: "string", description: "End date (YYYY-MM-DD)" },
        limit: { type: "string", description: "Maximum number of tasks to return" },
        offset: { type: "string", description: "Number of tasks to skip" },
        json: { type: "boolean", description: "Output in JSON format with life goals statistics" }
      }
    }
  },
  // Note tools
  {
    name: "todoist_note_add",
    description: "Add a note to a task or project",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to add note to" },
        projectId: { type: "string", description: "Project ID to add note to" },
        content: { type: "string", description: "Note content (required)" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["content"]
    }
  },
  {
    name: "todoist_note_batch_add",
    description: "Add the same note to multiple tasks",
    inputSchema: {
      type: "object",
      properties: {
        taskIds: { type: "string", description: "Task IDs to add note to (space-separated)" },
        content: { type: "string", description: "Note content (required)" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["taskIds", "content"]
    }
  },
  {
    name: "todoist_note_batch_add_project",
    description: "Add the same note to multiple projects",
    inputSchema: {
      type: "object",
      properties: {
        projectIds: { type: "string", description: "Project IDs to add note to (space-separated)" },
        content: { type: "string", description: "Note content (required)" },
        json: { type: "boolean", description: "Output in JSON format" }
      },
      required: ["projectIds", "content"]
    }
  }
];

// Tool execution mapping to actual script files
const TOOL_MAPPING: { [key: string]: { script: string, subcommand?: string } } = {
  // Find tool
  todoist_find: { script: 'find.js' },
  
  // List tools
  todoist_list_tasks: { script: 'list.js', subcommand: 'tasks' },
  todoist_list_projects: { script: 'list.js', subcommand: 'projects' },
  todoist_list_sections: { script: 'list.js', subcommand: 'sections' },
  
  // Task tools
  todoist_task_add: { script: 'task.js', subcommand: 'add' },
  todoist_task_batch_add: { script: 'task.js', subcommand: 'batch-add' },
  todoist_task_update: { script: 'task.js', subcommand: 'update' },
  todoist_task_batch_update: { script: 'task.js', subcommand: 'batch-update' },
  todoist_task_batch_move: { script: 'task.js', subcommand: 'batch-move' },
  
  // Project tools
  todoist_project_add: { script: 'project.js', subcommand: 'add' },
  todoist_project_bulk_add: { script: 'project.js', subcommand: 'bulk-add' },
  todoist_project_update: { script: 'project.js', subcommand: 'update' },
  
  // Section tools
  todoist_section_add: { script: 'section.js', subcommand: 'add' },
  todoist_section_bulk_add: { script: 'section.js', subcommand: 'bulk-add' },
  todoist_section_update: { script: 'section.js', subcommand: 'update' },
  todoist_section_remove: { script: 'section.js', subcommand: 'remove' },
  todoist_section_bulk_remove: { script: 'section.js', subcommand: 'bulk-remove' },
  
  // Status tools
  todoist_status_karma: { script: 'status.js', subcommand: 'karma' },
  todoist_status_completed: { script: 'status.js', subcommand: 'completed' },
  // Note tools
  todoist_note_add: { script: 'note.js', subcommand: 'add' },
  todoist_note_batch_add: { script: 'note.js', subcommand: 'batch-add' },
  todoist_note_batch_add_project: { script: 'note.js', subcommand: 'batch-add-project' }
};

async function runServer() {
  const startTime = new Date().toISOString();
  console.error(`Starting Todoist MCP Server at ${startTime}...`);

  // Set API token for child processes
 

  // Create a map of tools for capabilities
  const toolsMap = TOOLS.reduce((acc, tool) => {
    acc[tool.name] = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    };
    return acc;
  }, {} as Record<string, Tool>);

  // Create a map of resources for capabilities
  const resourcesMap = Object.values(TEST_RESOURCES).reduce((acc, resource) => {
    acc[resource.uri] = {
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    };
    return acc;
  }, {} as Record<string, { uri: string; name: string; description: string; mimeType: string }>);

  console.error(`Registering ${Object.keys(toolsMap).length} tools: ${Object.keys(toolsMap).join(", ")}`);
  console.error(`Registering ${Object.keys(resourcesMap).length} resources: ${Object.keys(resourcesMap).join(", ")}`);

  const server = new Server(
    {
      name: "todoist-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: toolsMap,
        resources: resourcesMap
      }
    }
  );

  // Handle process signals
  process.on('SIGINT', () => {
    console.error("Received SIGINT, shutting down...");
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error("Received SIGTERM, shutting down...");
    process.exit(0);
  });

  // Keep process alive
  process.stdin.resume();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.error("Received ListTools request");
    console.error(`Returning ${TOOLS.length} tools`);
    return {
      tools: TOOLS
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.error(`Received CallTool request for ${request.params.name}`);
    const toolConfig = TOOL_MAPPING[request.params.name];
    if (!toolConfig) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const toolPath = join(TOOLS_DIR, toolConfig.script);
    const useJson = request.params.arguments?.json === true;
    
    // Prepare arguments for the tool
    const args: string[] = [];
    
    // Add subcommand if present
    if (toolConfig.subcommand) {
      args.push(toolConfig.subcommand);
    }
    
    // Process arguments based on the tool's expected format
    for (const [key, value] of Object.entries(request.params.arguments || {})) {
      // Skip the json flag as we'll add it separately if needed
      if (key === 'json') continue;
      
      if (typeof value === 'boolean') {
        // For boolean flags, just add --flag-name without a value if true
        if (value === true) {
          args.push(`--${key}`);
        }
      } else if (typeof value === 'string') {
        // Special handling for parameters that should be arrays
        const needsArrayTransformation = (
          (toolConfig.script === 'section.js' && toolConfig.subcommand === 'bulk-add' && key === 'names') ||
          (toolConfig.script === 'project.js' && toolConfig.subcommand === 'bulk-add' && key === 'names') ||
          (toolConfig.script === 'task.js' && toolConfig.subcommand === 'batch-add' && key === 'tasks') ||
          (key === 'taskIds' || key === 'sections' || key === 'projectIds') ||
          (toolConfig.script === 'note.js' && toolConfig.subcommand === 'batch-add-project' && key === 'projectIds')
        );
        
        if (needsArrayTransformation) {
          // Convert the string to an array of arguments
          // This handles space-separated values with quoted strings
          // For example: "\"To Do\" \"In Progress\" \"Completed\""
          const regex = /"([^"]*)"|(\S+)/g;
          const matches = [...value.matchAll(regex)];
          const items = matches.map(match => match[1] || match[2]);
          
          // Add the parameter name
          args.push(`--${key}`);
          
          // Add each array item as a separate argument
          items.forEach(item => {
            args.push(item);
          });
        } else if (toolConfig.script === 'find.js' && key === 'filter') {
          // Special handling for find.js - the filter should be the first positional argument, not a flag
          args.unshift(value);
        } else if (key === 'filter' || key === 'tasks' || key === 'labels' || key === 'add-labels' || key === 'remove-labels') {
          // These parameters need to be quoted
          args.push(`--${key}`, `${value}`);
        } else {
          // Special mapping for single task add content parameter
          if (toolConfig.script === 'task.js' && toolConfig.subcommand === 'add' && key === 'content') {
            args.push(`--${key}`, `${value}`);
          } else {
            args.push(`--${key}=${value}`);
          }
        }
      }
    }

    try {
      const result = await executeTool(toolPath, args, useJson);
      console.error('Tool returned:', typeof result === 'string' ? result.substring(0, 100) + '...' : result);
      
      let formattedText;
      if (typeof result === 'string') {
        formattedText = result;
      } else if (Array.isArray(result)) {
        formattedText = JSON.stringify(result, null, 2);
      } else if (result && result.message) {
        formattedText = result.message;
      } else {
        formattedText = JSON.stringify(result, null, 2);
      }

      // Ensure formattedText is a non-empty string
      if (!formattedText) {
        formattedText = "No results found.";
      }

      // Debug logging to understand response structure
      console.error('Full response shape:', {
        result_type: typeof result,
        formattedText_type: typeof formattedText,
        formattedText_length: typeof formattedText === 'string' ? formattedText.length : 'N/A',
        has_content: Boolean(formattedText)
      });

      // Ensure the response conforms to the expected MCP structure
      return {
        content: [{
          type: "text",
          text: formattedText
        }]
      };
    } catch (error) {
      console.error('Tool error:', error);
      const errorResponse = {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
      console.error('Sending error response:', errorResponse);
      return errorResponse;
    }
  });

  // Add resource request handlers
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    console.error("Received ListResources request");
    return {
      resources: Object.values(TEST_RESOURCES).map(({ uri, name, description, mimeType }) => ({
        uri,
        name,
        description,
        mimeType
      }))
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    console.error(`Received ReadResource request for ${request.params.uri}`);
    const resource = TEST_RESOURCES[request.params.uri];
    if (!resource) {
      throw new Error(`Resource not found: ${request.params.uri}`);
    }
    return {
      contents: [{
        uri: resource.uri,
        mimeType: resource.mimeType,
        name: resource.name,
        type: "text",
        text: resource.content
      }]
    };
  });

  const transport = new StdioServerTransport();
  try {
    console.error("Connecting to transport...");
    await server.connect(transport);
    console.error("Todoist MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to connect transport:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});