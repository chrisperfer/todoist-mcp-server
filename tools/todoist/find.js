#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import { initializeApi, getProjectPath } from './lib/task-utils.js';

const filter = process.argv[2];
if (!filter) {
  console.error('Usage: find.js <filter>');
  console.error('Example: find.js "p:FLOOBY & @test"');
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
      tasks.forEach(task => console.log(task.id));
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