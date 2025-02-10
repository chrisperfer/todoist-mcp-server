#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

async function monitorFiles() {
  try {
    let thoughtNumber = 0;
    let previousListing = '';
    let nextThoughtNeeded = true;
    let workflowState = 'monitoring'; // Can be: monitoring, analyzing, processing

    while (nextThoughtNeeded) {
      thoughtNumber++;
      const { stdout: currentListing } = await execAsync('ls -l tools');
      
      let thought;
      if (workflowState === 'monitoring') {
        if (previousListing === '') {
          thought = {
            thought: `Starting to monitor the tools directory:\n${currentListing}`,
            thoughtNumber,
            totalThoughts: thoughtNumber,
            nextThoughtNeeded: true,
            waitSeconds: 10
          };
        } else if (previousListing !== currentListing) {
          workflowState = 'analyzing';
          thought = {
            thought: `I notice the directory has changed. Let me analyze what's different:\n\nBefore:\n${previousListing}\nAfter:\n${currentListing}`,
            thoughtNumber,
            totalThoughts: thoughtNumber + 1,
            nextThoughtNeeded: true
          };
        } else {
          thought = {
            thought: `Checking directory state:\n${currentListing}`,
            thoughtNumber,
            totalThoughts: thoughtNumber,
            nextThoughtNeeded: true,
            waitSeconds: 10
          };
        }
      } else if (workflowState === 'analyzing') {
        workflowState = 'processing';
        thought = {
          thought: `Based on my analysis of the changes, I will now process them. After processing, should I resume monitoring?`,
          thoughtNumber,
          totalThoughts: thoughtNumber,
          nextThoughtNeeded: true
        };
      } else if (workflowState === 'processing') {
        // Here the LLM can decide whether to go back to monitoring or stop
        workflowState = 'monitoring';
        thought = {
          thought: `Processing complete. Your next command?`,
          thoughtNumber,
          totalThoughts: thoughtNumber,
          nextThoughtNeeded: false
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

monitorFiles(); 