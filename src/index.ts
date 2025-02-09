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
async function executeTool(toolPath: string, args: string[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
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
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        resolve(stdout.trim());
      }
    });
  });
}

// Define tools that map to our CLI tools
const TOOLS: Tool[] = [
  {
    name: "todoist_list_tasks",
    description: "List tasks from Todoist with various filters",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project ID to filter tasks" },
        filter: { type: "string", description: "Todoist filter query" }
      }
    }
  },
  {
    name: "todoist_add_task",
    description: "Create a new task in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Task content" },
        description: { type: "string", description: "Task description" },
        project_id: { type: "string", description: "Project ID" },
        due_string: { type: "string", description: "Due date in natural language" }
      },
      required: ["content"]
    }
  },
  {
    name: "todoist_update_task",
    description: "Update an existing task in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task ID to update" },
        content: { type: "string", description: "New task content" },
        description: { type: "string", description: "New task description" },
        due_string: { type: "string", description: "New due date" }
      },
      required: ["task_id"]
    }
  },
  {
    name: "todoist_move_task",
    description: "Move a task to a different project or section",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task ID to move" },
        project_id: { type: "string", description: "Target project ID" },
        section_id: { type: "string", description: "Target section ID (optional)" }
      },
      required: ["task_id", "project_id"]
    }
  },
  {
    name: "todoist_auto_tagger",
    description: "Automatically tag tasks based on content",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task ID to auto-tag" }
      },
      required: ["task_id"]
    }
  },
  {
    name: "todoist_list_labels",
    description: "List all labels in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        name_contains: { type: "string", description: "Filter labels by name" }
      }
    }
  },
  {
    name: "todoist_add_comment",
    description: "Add a comment to a task",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "Task ID to comment on" },
        content: { type: "string", description: "Comment content" }
      },
      required: ["task_id", "content"]
    }
  },
  {
    name: "todoist_list_projects",
    description: "List all projects in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        name_contains: { type: "string", description: "Filter projects by name" }
      }
    }
  },
  {
    name: "todoist_add_project",
    description: "Create a new project in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        parent_id: { type: "string", description: "Parent project ID" }
      },
      required: ["name"]
    }
  },
  {
    name: "todoist_update_project",
    description: "Update an existing project in Todoist",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project ID to update" },
        name: { type: "string", description: "New project name" }
      },
      required: ["project_id"]
    }
  },
  {
    name: "todoist_move_project",
    description: "Move a project to a different parent",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project ID to move" },
        parent_id: { type: "string", description: "New parent project ID" }
      },
      required: ["project_id"]
    }
  },
  {
    name: "todoist_list_sections",
    description: "List sections in a project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Project ID to list sections from" }
      },
      required: ["project_id"]
    }
  },
  {
    name: "todoist_add_section",
    description: "Add a new section to a project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Section name" },
        project_id: { type: "string", description: "Project ID to add section to" }
      },
      required: ["name", "project_id"]
    }
  },
  {
    name: "todoist_remove_section",
    description: "Remove a section from a project",
    inputSchema: {
      type: "object",
      properties: {
        section_id: { type: "string", description: "Section ID to remove" }
      },
      required: ["section_id"]
    }
  }
];

// Tool execution mapping
const TOOL_MAPPING: { [key: string]: string } = {
  todoist_list_tasks: 'list-tasks.js',
  todoist_add_task: 'add-task.js',
  todoist_update_task: 'update-task.js',
  todoist_move_task: 'move-task.js',
  todoist_auto_tagger: 'auto-tagger.js',
  todoist_list_labels: 'list-labels.js',
  todoist_add_comment: 'add-comment.js',
  todoist_list_projects: 'list-projects.js',
  todoist_add_project: 'add-project.js',
  todoist_update_project: 'update-project.js',
  todoist_move_project: 'move-project.js',
  todoist_list_sections: 'list-sections.js',
  todoist_add_section: 'add-section.js',
  todoist_remove_section: 'remove-section.js'
};

async function runServer() {
  const startTime = new Date().toISOString();
  console.error(`Starting Todoist MCP Server at ${startTime}...`);

  // Set API token for child processes
  process.env.TODOIST_API_TOKEN = 'fdebb665194ea019e3362061d94c4502678576a5';

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
    const toolScript = TOOL_MAPPING[request.params.name];
    if (!toolScript) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const toolPath = join(TOOLS_DIR, toolScript);
    const args = Object.entries(request.params.arguments || {}).map(([key, value]) => 
      typeof value === 'string' ? `--${key}=${value}` : `--${key}=${JSON.stringify(value)}`
    );

    try {
      const result = await executeTool(toolPath, args);
      console.error('Tool returned:', result);
      
      let formattedText;
      if (typeof result === 'string') {
        formattedText = result;
      } else if (Array.isArray(result)) {
        formattedText = result.map(project => 
          `${project.name} (ID: ${project.id})${project.sections?.length ? `\n  Sections: ${project.sections.map((s: { name: string }) => s.name).join(', ')}` : ''}`
        ).join('\n');
      } else if (result.message) {
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

      console.error('Sending response:', response);
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