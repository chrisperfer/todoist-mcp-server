#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function listTools() {
  try {
    const { stdout } = await execAsync('ls -l tools');
    console.log(stdout);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

listTools(); 