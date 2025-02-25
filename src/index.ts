#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOOLS_DIR = join(__dirname, '..', 'tools', 'todoist');

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
  todoist_status_completed: { script: 'status.js', subcommand: 'completed' }
};

async function runServer() {
  const startTime = new Date().toISOString();
  console.error(`Starting Todoist MCP Server at ${startTime}...`);

  // Set API token for child processes
  if (!process.env.TODOIST_API_TOKEN) {
    console.error("Warning: TODOIST_API_TOKEN environment variable not set. Please set it for the server to function properly.");
  }

  // Create a map of tools for capabilities
  const toolsMap = TOOLS.reduce((acc, tool) => {
    acc[tool.name] = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    };
    return acc;
  }, {} as Record<string, Tool>);

  console.error(`Registering ${Object.keys(toolsMap).length} tools: ${Object.keys(toolsMap).join(", ")}`);

  const server = new Server(
    {
      name: "todoist-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: toolsMap
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
        // For string values, add as --key=value or --key "value" depending on command
        if (key === 'filter' || key === 'tasks' || key === 'names' || key === 'taskIds' || key === 'sections' || 
            key === 'labels' || key === 'add-labels' || key === 'remove-labels') {
          // These parameters need to be quoted
          args.push(`--${key}`, `${value}`);
        } else {
          args.push(`--${key}=${value}`);
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

      const response = {
        result: {
          content: [{
            type: "text",
            text: formattedText
          }]
        }
      };

      console.error('Sending response:', typeof formattedText === 'string' ? formattedText.substring(0, 100) + '...' : formattedText);
      return response;
    } catch (error) {
      console.error('Tool error:', error);
      const errorResponse = {
        result: {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        }
      };
      console.error('Sending error response:', errorResponse);
      return errorResponse;
    }
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