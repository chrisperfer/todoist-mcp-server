#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

async function monitorProjects() {
  try {
    let thoughtNumber = 0;
    let previousListing = '';
    let nextThoughtNeeded = true;
    let workflowState = 'monitoring'; // Can be: monitoring, analyzing, listing_tasks

    while (nextThoughtNeeded) {
      thoughtNumber++;
      const { stdout: currentListing } = await execAsync('node tools/todoist/list-projects.js');
      
      let thought;
      if (workflowState === 'monitoring') {
        if (previousListing === '') {
          thought = {
            thought: `Starting to monitor Todoist projects:\n${currentListing}`,
            thoughtNumber,
            totalThoughts: thoughtNumber,
            nextThoughtNeeded: true,
            waitSeconds: 10
          };
        } else if (previousListing !== currentListing) {
          workflowState = 'analyzing';
          thought = {
            thought: `I notice the projects have changed. Let me analyze what's different:\n\nBefore:\n${previousListing}\nAfter:\n${currentListing}\n\nI will identify the changed project and list its tasks.`,
            thoughtNumber,
            totalThoughts: thoughtNumber + 1,
            nextThoughtNeeded: true
          };
        } else {
          thought = {
            thought: `Checking projects state:\n${currentListing}`,
            thoughtNumber,
            totalThoughts: thoughtNumber,
            nextThoughtNeeded: true,
            waitSeconds: 10
          };
        }
      } else if (workflowState === 'analyzing') {
        workflowState = 'listing_tasks';
        // Here we let the LLM identify which project changed and list its tasks
        thought = {
          thought: `Now I will list the tasks for the changed project. I'll use the project ID from the listing above.`,
          thoughtNumber,
          totalThoughts: thoughtNumber,
          nextThoughtNeeded: true
        };
      } else if (workflowState === 'listing_tasks') {
        // After listing tasks, we can go back to monitoring
        workflowState = 'monitoring';
        thought = {
          thought: `Task listing complete. I'll resume monitoring projects.`,
          thoughtNumber,
          totalThoughts: thoughtNumber,
          nextThoughtNeeded: true
        };
      }

      const tmpFile = join(tmpdir(), `thought-${Date.now()}.json`);
      await writeFile(tmpFile, JSON.stringify(thought));
      
      const { stdout, stderr } = await execAsync(
        `node tools/todoist/sequential-thinking-tool.js < ${tmpFile}`
      );

      if (stderr) console.error(stderr);
      
      const response = JSON.parse(stdout);
      const thoughtResponse = JSON.parse(response.content[0].text);
      nextThoughtNeeded = thoughtResponse.nextThoughtNeeded;
      
      previousListing = currentListing;
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

monitorProjects(); 