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
    if (data.waitSeconds && typeof data.waitSeconds !== 'number') {
      throw new Error('Invalid waitSeconds: must be a number');
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
      waitSeconds: data.waitSeconds,
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
      waitSeconds,
    } = thoughtData;

    // Get terminal width (default to 120 if can't be determined)
    const terminalWidth = process.stdout.columns || 120;
    const maxWidth = terminalWidth - 4; // Account for borders

    let prefix = '';
    let context = '';

    if (waitSeconds) {
      prefix = chalk.cyan('⏳ Waiting');
      context = ` (${waitSeconds}s)`;
    } else if (isRevision) {
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
    
    // Word wrap the thought content
    const wrappedThought = this.wordWrap(thought, maxWidth - 4); // Account for side padding
    const lines = wrappedThought.split('\n');
    
    // Calculate box dimensions
    const contentWidth = Math.max(
      header.length,
      ...lines.map(line => line.length)
    );
    const boxWidth = Math.min(maxWidth, contentWidth + 4); // Add padding
    
    // Create borders
    const horizontalBorder = '─'.repeat(boxWidth);
    
    // Build the box with proper alignment
    const formattedLines = [
      `┌${horizontalBorder}┐`,
      `│  ${header}${' '.repeat(boxWidth - header.length - 2)}│`,
      `├${horizontalBorder}┤`,
      ...lines.map(line => `│  ${line}${' '.repeat(boxWidth - line.length - 2)}│`),
      `└${horizontalBorder}┘`
    ];

    return '\n' + formattedLines.join('\n') + '\n';
  }

  // Helper function to wrap text at word boundaries
  wordWrap(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine.length === 0 ? '' : ' ') + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.join('\n');
  }

  // Processes a single thought (input object) and returns a JSON object.
  async processThought(input) {
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

      // If waitSeconds is specified, wait for that duration
      if (validatedInput.waitSeconds) {
        await new Promise(resolve => setTimeout(resolve, validatedInput.waitSeconds * 1000));
      }

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
    const result = await tool.processThought(jsonInput);
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