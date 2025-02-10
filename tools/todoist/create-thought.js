#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

class FileMonitor {
  constructor() {
    this.currentThought = 0;
  }

  async createThought() {
    this.currentThought++;
    const { stdout: files } = await execAsync('ls -l tools');
    
    return {
      thought: this.currentThought === 1
        ? `Initial file listing. Please analyze:\n${files}`
        : `Please analyze this file listing and tell me if anything has changed:\n${files}`,
      thoughtNumber: this.currentThought,
      totalThoughts: this.currentThought,
      nextThoughtNeeded: true,
      waitSeconds: 10,
      metadata: { files }
    };
  }
}

async function monitorFiles() {
  try {
    const monitor = new FileMonitor();
    let nextThoughtNeeded = true;
    let previousThought = null;

    while (nextThoughtNeeded) {
      const thought = await monitor.createThought();
      
      if (previousThought && previousThought.metadata.files !== thought.metadata.files) {
        const finalThought = {
          thought: `Changes detected! Here are both listings for analysis:\n\nPrevious listing:\n${previousThought.metadata.files}\n\nNew listing:\n${thought.metadata.files}\n\nPlease analyze and explain what has changed. Would you like to continue monitoring for more changes?`,
          thoughtNumber: monitor.currentThought + 1,
          totalThoughts: monitor.currentThought + 1,
          nextThoughtNeeded: true
        };
        
        const tmpFile = join(tmpdir(), `thought-${Date.now()}.json`);
        await writeFile(tmpFile, JSON.stringify(finalThought));
        const { stdout, stderr } = await execAsync(`node tools/todoist/sequential-thinking-tool.js < ${tmpFile}`);
        
        if (stderr) console.error(stderr);
        const response = JSON.parse(stdout);
        const thoughtResponse = JSON.parse(response.content[0].text);
        nextThoughtNeeded = thoughtResponse.nextThoughtNeeded;
        
        if (nextThoughtNeeded) {
          previousThought = thought;
          continue;
        }
        break;
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
      
      previousThought = thought;
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

monitorFiles(); 