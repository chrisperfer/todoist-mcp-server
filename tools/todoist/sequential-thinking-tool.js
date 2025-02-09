#!/usr/bin/env node

import chalk from 'chalk';
import { stdin as input, stdout as output } from 'process';
import { createInterface } from 'readline';
import url from 'url';

/**
 * This class encapsulates the core logic from the MCP server.
 * It maintains a history of "thoughts" and any branches, validates incoming data,
 * formats a visual representation, and returns a JSON summary.
 */
class SequentialThinkingTool {
  constructor() {
    this.thoughtHistory = [];
    this.branches = {};
  }

  // Validates that required fields exist and are of the right type.
  validateThoughtData(input) {
    const data = input;
    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }
    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision === true,
      revisesThought: data.revisesThought,
      branchFromThought: data.branchFromThought,
      branchId: data.branchId,
      needsMoreThoughts: data.needsMoreThoughts,
    };
  }

  // Formats the thought as a bordered box using chalk colors.
  formatThought(thoughtData) {
    const {
      thoughtNumber,
      totalThoughts,
      thought,
      isRevision,
      revisesThought,
      branchFromThought,
      branchId,
    } = thoughtData;
    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }
    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);
    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  // Processes a single thought (input object) and returns a JSON object.
  processThought(input) {
    try {
      const validatedInput = this.validateThoughtData(input);
      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }
      this.thoughtHistory.push(validatedInput);
      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }
      const formattedThought = this.formatThought(validatedInput);
      // Log the formatted thought to stderr (so it does not interfere with STDOUT JSON output).
      console.error(formattedThought);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                thoughtNumber: validatedInput.thoughtNumber,
                totalThoughts: validatedInput.totalThoughts,
                nextThoughtNeeded: validatedInput.nextThoughtNeeded,
                branches: Object.keys(this.branches),
                thoughtHistoryLength: this.thoughtHistory.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                status: 'failed',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }
}

// Reads all data from STDIN and returns it as a Promise.
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', reject);
  });
}

// Main function: read JSON input, process the thought, and output the result.
async function main() {
  try {
    const inputData = await readStdin();
    let jsonInput;
    try {
      jsonInput = JSON.parse(inputData);
    } catch (parseError) {
      console.error('Error parsing input JSON:', parseError.message);
      process.exit(1);
    }
    const tool = new SequentialThinkingTool();
    const result = tool.processThought(jsonInput);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  main();
}

export { SequentialThinkingTool };