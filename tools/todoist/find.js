#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import { initializeApi, getProjectPath } from './lib/task-utils.js';

const filter = process.argv[2];
if (!filter) {
  console.error('Usage: find.js <filter> [--ids] [--json]');
  console.error('Examples:');
  console.error('  find.js "p:FLOOBY & @test"     # Find tasks in FLOOBY project with @test label');
  console.error('  find.js "overdue" --ids | xargs task.js batch-update --taskIds --priority 1');
  console.error('  find.js "p:FLOOBY & @test" --ids | xargs task.js batch-move --taskIds --to-section-id 183758533');
  process.exit(1);
}

const ids = process.argv.includes('--ids');
const json = process.argv.includes('--json');

if (ids && json) {
  console.error('Error: Cannot use both --ids and --json options');
  process.exit(1);
}

const HELP = {
  description: 'Find tasks using Todoist filters',
  usage: 'find.js <filter> [--ids] [--json]',
  examples: [
    'find.js "p:FLOOBY & @test"     # Find tasks in FLOOBY project with @test label',
    'find.js "overdue" --ids | xargs task.js batch-update --taskIds --priority 1     # Set priority for overdue tasks',
    'find.js "today | tomorrow"     # Find tasks due today or tomorrow',
    'find.js "search: meeting"      # Find tasks containing "meeting"',
    'find.js "@work & p:FLOOBY"     # Find work-labeled tasks in FLOOBY project',
    'find.js "overdue" --ids | xargs task.js batch-update --taskIds --complete     # Complete all overdue tasks',
    'find.js "p:FLOOBY & @test" --ids | xargs task.js batch-move --taskIds --to-section-id 183758533     # Move matching tasks to section',
    'find.js "no labels" --json > unlabeled-tasks.json     # Export tasks to JSON file'
  ],
  options: {
    '--ids': 'Output task IDs in format suitable for batch commands',
    '--json': 'Output in JSON format with enhanced task information'
  },
  notes: [
    'For filter syntax, see: https://todoist.com/help/articles/205280588-search-and-filter',
    'Default output shows task content, project path, section name, parent task, and labels',
    'The --ids option outputs IDs in a format ready for batch commands',
    'The --json option includes project paths and section names in the output',
    'Cannot use both --ids and --json options together',
    'Use --ids with batch commands for efficient bulk operations',
    'Use --json for programmatic processing or data export'
  ]
};

async function main() {
  try {
    const api = await initializeApi();
    const tasks = await api.getTasks({ filter });
    const sections = await api.getSections();

    if (ids) {
      // Output IDs in the format that works with batch-move
      process.stdout.write('--taskIds ');
      tasks.forEach((task, i) => {
        process.stdout.write(`"${task.id}"`);
        if (i < tasks.length - 1) process.stdout.write(' ');
      });
      process.stdout.write('\n');
    } else if (json) {
      // Enhance tasks with project and section names
      const enhancedTasks = await Promise.all(tasks.map(async task => ({
        ...task,
        projectPath: await getProjectPath(api, task.projectId),
        sectionName: task.sectionId ? sections.find(s => s.id === task.sectionId)?.name : null
      })));
      console.log(JSON.stringify(enhancedTasks, null, 2));
    } else {
      for (const task of tasks) {
        console.log(`[${task.id}] ${task.content}`);
        console.log(`  Project: ${await getProjectPath(api, task.projectId)}`);
        if (task.sectionId) {
          const section = sections.find(s => s.id === task.sectionId);
          console.log(`  Section: ${section ? section.name : task.sectionId}`);
        }
        if (task.parentId) {
          const parent = (await api.getTasks()).find(t => t.id === task.parentId);
          console.log(`  Parent: ${parent ? parent.content : task.parentId}`);
        }
        if (task.labels.length) console.log(`  Labels: ${task.labels.join(', ')}`);
        console.log('');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main(); 