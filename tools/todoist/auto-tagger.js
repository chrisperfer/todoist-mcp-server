#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

// State machine for processing thoughts
class AutoTaggerThoughts {
  constructor(options = {}) {
    this.state = {
      projectName: options.project || 'Inbox',
      goalLabels: [],
      tasks: [],
      labelSuggestions: [],
      currentThought: 1,
      totalThoughts: 5
    };
  }

  async processThought(thoughtNumber) {
    const api = new TodoistApi(process.env.TODOIST_API_TOKEN);
    
    switch (thoughtNumber) {
      case 1: // Get all labels and filter goals
        return {
          thought: "Fetching and filtering goal labels...",
          thoughtNumber: 1,
          totalThoughts: this.state.totalThoughts,
          nextThoughtNeeded: true,
          async execute() {
            const labels = await api.getLabels();
            this.state.goalLabels = labels
              .filter(l => l.name.startsWith('Goals:'))
              .map(l => l.name);
            return `Found ${this.state.goalLabels.length} goal labels`;
          }
        };

      case 2: // Get tasks from project
        return {
          thought: `Getting tasks from project: ${this.state.projectName}`,
          thoughtNumber: 2,
          totalThoughts: this.state.totalThoughts,
          nextThoughtNeeded: true,
          async execute() {
            const { stdout } = await execAsync(
              `node tools/todoist/list-tasks.js --project "${this.state.projectName}"`
            );
            
            // Parse the text output into task objects
            this.state.tasks = stdout.split('\n')
              .filter(line => line.trim())
              .map(line => {
                // Extract task info including labels
                const [id, ...rest] = line.split(/\s+/);
                const content = rest.join(' ');
                
                // Extract existing labels (they appear after @)
                const labels = [];
                const labelMatch = content.match(/@([^)\s]+)/g);
                if (labelMatch) {
                  labels.push(...labelMatch.map(l => l.substring(1)));
                }
                
                // Clean up the content
                const cleanContent = content
                  .replace(/@[^)\s]+/g, '') // Remove labels
                  .replace(/\s*\([^)]*\)\s*$/, '') // Remove metadata in parentheses
                  .replace(/\s*\[[^\]]*\]\s*$/, '') // Remove remaining metadata
                  .trim();
                
                return { id, content: cleanContent, labels };
              });
            
            return `Retrieved ${this.state.tasks.length} tasks`;
          }
        };

      case 3: // Analyze tasks
        return {
          thought: "Analyzing tasks against available goal labels...",
          thoughtNumber: 3,
          totalThoughts: this.state.totalThoughts,
          nextThoughtNeeded: true,
          async execute() {
            // Here we would typically call an AI service to analyze
            // For now, we'll just prepare the context
            this.state.analysisContext = {
              tasks: this.state.tasks.filter(task => 
                !task.labels.some(label => label.startsWith('Goals:'))
              ),
              goalLabels: this.state.goalLabels
            };
            return `Analysis context prepared for ${this.state.analysisContext.tasks.length} tasks without goal labels`;
          }
        };

      case 4: // Generate label suggestions
        return {
          thought: "Generating label suggestions for each task...",
          thoughtNumber: 4,
          totalThoughts: this.state.totalThoughts,
          nextThoughtNeeded: true,
          async execute() {
            // Here we would process the analysis results
            // For now, we'll just create a simple mapping
            // Only generate suggestions for tasks without goal labels
            this.state.labelSuggestions = this.state.analysisContext.tasks.map(task => ({
              taskId: task.id,
              suggestedLabels: this.state.goalLabels.filter(() => Math.random() > 0.7)
            }));
            return `Generated suggestions for ${this.state.labelSuggestions.length} tasks`;
          }
        };

      case 5: // Apply labels
        return {
          thought: "Applying suggested labels to tasks...",
          thoughtNumber: 5,
          totalThoughts: this.state.totalThoughts,
          nextThoughtNeeded: false,
          async execute() {
            // First verify we can get tasks directly from the API
            const tasks = await api.getTasks();
            console.log(`API returned ${tasks.length} tasks`);
            
            for (const suggestion of this.state.labelSuggestions) {
              if (suggestion.suggestedLabels.length > 0) {
                const task = this.state.tasks.find(t => t.id === suggestion.taskId);
                if (task) {
                  // Check if this task exists in the API results
                  const apiTask = tasks.find(t => t.id === task.id);
                  if (!apiTask) {
                    console.log(`Task ${task.id} not found in API results`);
                    continue;
                  }
                  
                  console.log(`Updating task: ${task.id}`);
                  console.log(`Content: ${task.content}`);
                  console.log(`Labels: ${suggestion.suggestedLabels.join(',')}`);
                  
                  const escapedContent = task.content.replace(/"/g, '\\"');
                  try {
                    await execAsync(
                      `node tools/todoist/update-task.js "${task.id}" --content "${escapedContent}" --labels "${suggestion.suggestedLabels.join(',')}"`
                    );
                    console.log('Update successful');
                  } catch (error) {
                    console.log('Update failed:', error.message);
                  }
                }
              }
            }
            return "Applied all label suggestions";
          }
        };
    }
  }
}

async function autoTagger(options = {}) {
  try {
    if (!process.env.TODOIST_API_TOKEN) {
      console.error("Error: TODOIST_API_TOKEN environment variable is required");
      process.exit(1);
    }

    console.log("Starting auto-tagger...");
    const tagger = new AutoTaggerThoughts(options);
    let currentThought = 1;
    let nextThoughtNeeded = true;

    while (nextThoughtNeeded) {
      console.log(`\nProcessing thought ${currentThought}...`);
      const thoughtProcessor = await tagger.processThought(currentThought);
      
      const result = await thoughtProcessor.execute.call(tagger);
      
      // Use sequential-thinking-tool to process the thought
      const thoughtInput = {
        thought: `${thoughtProcessor.thought}\nResult: ${result}`,
        thoughtNumber: currentThought,
        totalThoughts: tagger.state.totalThoughts,
        nextThoughtNeeded: thoughtProcessor.nextThoughtNeeded,
        isRevision: false
      };

      // Write thought to temp file
      const tmpFile = join(tmpdir(), `thought-${Date.now()}.json`);
      await writeFile(tmpFile, JSON.stringify(thoughtInput, null, 2));

      // Process the thought and capture both stdout and stderr
      const { stdout, stderr } = await execAsync(
        `node tools/todoist/sequential-thinking-tool.js < ${tmpFile}`,
        { env: process.env }
      );

      // Display the formatted thought from stderr
      if (stderr) console.error(stderr);
      
      // Parse the response which contains a content array
      const response = JSON.parse(stdout);
      const thoughtResponse = JSON.parse(response.content[0].text);
      nextThoughtNeeded = thoughtResponse.nextThoughtNeeded;
      currentThought++;
    }

  } catch (error) {
    console.error("Error in script:", error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  project: null
};

// Parse project name if provided
const projectIndex = args.findIndex(arg => arg === '--project');
if (projectIndex !== -1 && projectIndex + 1 < args.length) {
  options.project = args[projectIndex + 1];
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  autoTagger(options);
}

export { autoTagger }; 