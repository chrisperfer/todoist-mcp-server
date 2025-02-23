#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import { initializeApi, getProjectPath } from './lib/task-utils.js';

const HELP = {
  description: 'Find tasks using Todoist filters',
  usage: 'find.js <filter> [--ids] [--json]',
  examples: [
    'find.js "p:FLOOBY & @test"     # Find tasks in FLOOBY project with @test label',
    'find.js "search:meeting"        # Find tasks containing "meeting"',
    'find.js "p:FLOOBY & search:important"  # Find tasks in project containing text',
    'find.js "today | tomorrow"      # Find tasks due today or tomorrow',
    'find.js "@work & p:FLOOBY"      # Find work-labeled tasks in FLOOBY project',
    'find.js "no date & p:FLOOBY"    # Find tasks without dates in project',
    'find.js "overdue & @urgent"     # Find overdue tasks with urgent label',
    'find.js "p:FLOOBY & no labels"  # Find tasks without labels in project'
  ],
  options: {
    '--ids': 'Output task IDs in format suitable for batch commands',
    '--json': 'Output in JSON format with enhanced task information'
  },
  notes: [
    'Filter Syntax Guide:',
    '  - p:ProjectName    Search in project',
    '  - search:text      Search for text in task names',
    '  - @label          Search by label',
    '  - no date         Tasks without dates',
    '  - no labels       Tasks without labels',
    '  - overdue         Overdue tasks',
    '  - today           Due today',
    '  - &               Combine filters (AND)',
    '  - |               Combine filters (OR)',
    '',
    'Search Tips:',
    '  - Always use search:text for text searches instead of raw text',
    '  - Combine filters with & (AND) or | (OR)',
    '  - Project names are case-sensitive and must match exactly',
    '  - Use quotes around filters with spaces',
    '',
    'Output Options:',
    '  - Default: Shows task content, project, section, parent, and labels',
    '  - --ids: Outputs IDs ready for batch commands',
    '  - --json: Includes project paths and section names',
    '  - Cannot use both --ids and --json together'
  ]
};

// Handle help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`\n${HELP.description}\n`);
  console.log(`Usage: ${HELP.usage}\n`);
  console.log('Examples:');
  HELP.examples.forEach(example => console.log(`  ${example}`));
  console.log('\nOptions:');
  Object.entries(HELP.options).forEach(([option, desc]) => console.log(`  ${option}\t${desc}`));
  console.log('\nNotes:');
  HELP.notes.forEach(note => console.log(note));
  process.exit(0);
}

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