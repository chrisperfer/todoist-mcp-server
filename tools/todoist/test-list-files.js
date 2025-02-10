#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

function parseFileList(output) {
  return output.split('\n')
    .filter(line => line.trim() && !line.startsWith('total'))  // Skip empty lines and 'total' line
    .map(line => {
      // ls -l format: permissions links owner group size date filename
      // We need to handle filenames with spaces, so we'll split from the front
      const match = line.match(/^[\w-]+([\s\S]+?)\s+(\d+)\s+(\w+)\s+(\w+)\s+(\d+)\s+([A-Za-z]+\s+\d+\s+[\d:]+)\s+(.+)$/);
      if (match) {
        return {
          permissions: match[1].trim(),
          owner: match[3],
          group: match[4],
          size: match[5],
          date: match[6],
          name: match[7],
          line: line
        };
      }
      // Fallback if the regex doesn't match
      return {
        name: line.trim(),
        line: line
      };
    });
}

function findChanges(oldFiles, newFiles) {
  const oldMap = new Map(oldFiles.map(f => [f.name, f]));
  const newMap = new Map(newFiles.map(f => [f.name, f]));
  
  const added = newFiles.filter(f => !oldMap.has(f.name));
  const deleted = oldFiles.filter(f => !newMap.has(f.name));
  const modified = newFiles.filter(f => {
    const oldFile = oldMap.get(f.name);
    return oldFile && (
      oldFile.size !== f.size ||
      oldFile.date !== f.date ||
      oldFile.permissions !== f.permissions
    );
  });

  console.log('Checking for changes...');
  console.log('Current files:', [...newMap.keys()]);
  if (added.length) console.log('Added:', added.map(f => f.name));
  if (deleted.length) console.log('Deleted:', deleted.map(f => f.name));
  if (modified.length) console.log('Modified:', modified.map(f => f.name));

  return {
    added,
    deleted,
    modified,
    hasChanges: added.length > 0 || deleted.length > 0 || modified.length > 0
  };
}

async function testListFiles() {
  try {
    let currentThought = 1;
    let previousFiles = [];
    let changesDetected = false;

    // Get initial file listing
    const { stdout: initialFiles } = await execAsync('ls -l tools');
    previousFiles = parseFileList(initialFiles);

    while (!changesDetected) {
      // Get current file listing
      const { stdout: files } = await execAsync('ls -l tools');
      const currentFiles = parseFileList(files);
      
      // Check for changes
      const changes = findChanges(previousFiles, currentFiles);
      changesDetected = changes.hasChanges;

      // Create thought for current listing
      const thought = {
        thought: changesDetected
          ? `Changes detected!\n${[
              changes.added.length && `New files:\n${changes.added.map(f => f.line).join('\n')}`,
              changes.deleted.length && `Deleted files:\n${changes.deleted.map(f => f.name).join('\n')}`,
              changes.modified.length && `Modified files:\n${changes.modified.map(f => f.line).join('\n')}`
            ].filter(Boolean).join('\n\n')}`
          : `File listing #${currentThought} - No changes detected:\n${files}`,
        thoughtNumber: currentThought,
        totalThoughts: currentThought,
        nextThoughtNeeded: !changesDetected,
        // Add wait time if we haven't detected changes
        ...(!changesDetected && { waitSeconds: 15 })
      };

      // Process the thought
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
      
      previousFiles = currentFiles;
      currentThought++;
    }

  } catch (error) {
    console.error("Error in script:", error.message);
    process.exit(1);
  }
}

// Run if called directly
testListFiles(); 