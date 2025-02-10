#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

async function testWait() {
  try {
    // First thought - no waiting
    const thought1 = {
      thought: "Starting the test sequence...",
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true
    };

    // Second thought - wait for 5 seconds
    const thought2 = {
      thought: "Now we'll wait for 5 seconds...",
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      waitSeconds: 5
    };

    // Third thought - no waiting
    const thought3 = {
      thought: "Test sequence complete!",
      thoughtNumber: 3,
      totalThoughts: 3,
      nextThoughtNeeded: false
    };

    // Process each thought
    for (const thought of [thought1, thought2, thought3]) {
      const tmpFile = join(tmpdir(), `thought-${Date.now()}.json`);
      await writeFile(tmpFile, JSON.stringify(thought, null, 2));

      const { stdout, stderr } = await execAsync(
        `node tools/todoist/sequential-thinking-tool.js < ${tmpFile}`,
        { env: process.env }
      );

      if (stderr) console.error(stderr);
      
      const response = JSON.parse(stdout);
      const thoughtResponse = JSON.parse(response.content[0].text);
      
      if (!thoughtResponse.nextThoughtNeeded) break;
    }

  } catch (error) {
    console.error("Error in script:", error.message);
    process.exit(1);
  }
}

// Run if called directly
testWait(); 