#!/usr/bin/env node

import { randomUUID } from 'crypto';
import url from 'url';
import {
    initializeApi,
    getProjectPath,
    executeSyncCommand,
    executeSyncCommands,
    formatJsonOutput
} from './lib/task-utils.js';
import {
    resolveProjectId,
    resolveSectionId,
    searchSections,
    formatSectionList
} from './lib/id-utils.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function addSection(api, name, options) {
    let projectId;
    try {
        projectId = await resolveProjectId(api, options.projectId);
    } catch (error) {
        console.error(`Error: Project "${options.projectId}" not found`);
        process.exit(1);
    }

    const command = {
        type: 'section_add',
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
            name,
            project_id: projectId,
            ...(options.order !== undefined && { order: parseInt(options.order) })
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Get the newly created section
    const sections = await api.getSections();
    const newSection = sections.find(s => 
        s.name === name && 
        s.projectId === projectId
    );

    if (options.json) {
        console.log(formatJsonOutput(newSection, 'created', {
            project: await getProjectPath(api, projectId)
        }));
    } else {
        console.log(`Section created: ${newSection.id}`);
        console.log(`Name: ${newSection.name}`);
        console.log(`Project: ${await getProjectPath(api, projectId)}`);
        if (newSection.order) console.log(`Order: ${newSection.order}`);
    }
}

async function bulkAddSections(api, sections, options) {
    let projectId;
    try {
        projectId = await resolveProjectId(api, options.projectId);
    } catch (error) {
        console.error(`Error: Project "${options.projectId}" not found`);
        process.exit(1);
    }

    // Create commands for each section
    const commands = sections.map((name, index) => ({
        type: 'section_add',
        uuid: randomUUID(),
        temp_id: randomUUID(),
        args: {
            name,
            project_id: projectId,
            ...(options.startOrder !== undefined && { 
                order: parseInt(options.startOrder) + index 
            })
        }
    }));

    await executeSyncCommands(process.env.TODOIST_API_TOKEN, commands);

    // Get the newly created sections
    const allSections = await api.getSections();
    const newSections = allSections.filter(s => 
        sections.includes(s.name) && 
        s.projectId === projectId
    );

    if (options.json) {
        console.log(JSON.stringify({
            sections: await Promise.all(newSections.map(async section => ({
                ...section,
                projectPath: await getProjectPath(api, projectId)
            }))),
            status: 'created',
            count: newSections.length
        }, null, 2));
    } else {
        console.log(`Added ${newSections.length} sections to ${await getProjectPath(api, projectId)}:`);
        for (const section of newSections) {
            console.log(`- ${section.name} (${section.id})`);
            if (section.order) console.log(`  Order: ${section.order}`);
        }
    }
}

async function updateSection(api, sectionQuery, options) {
    let section;
    try {
        const sectionId = await resolveSectionId(api, sectionQuery);
        const sections = await api.getSections();
        section = sections.find(s => s.id === sectionId);
    } catch (error) {
        console.error(`Error: Section "${sectionQuery}" not found`);
        process.exit(1);
    }

    const updateData = {};
    if (options.name) updateData.name = options.name;
    if (options.order !== undefined) updateData.order = parseInt(options.order);

    // If moving to a different project
    if (options.projectId) {
        try {
            updateData.project_id = await resolveProjectId(api, options.projectId);
        } catch (error) {
            console.error(`Error: Project "${options.projectId}" not found`);
            process.exit(1);
        }
    }

    const command = {
        type: 'section_update',
        uuid: randomUUID(),
        args: {
            id: section.id,
            ...updateData
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Get the updated section
    const updatedSections = await api.getSections();
    const updatedSection = updatedSections.find(s => s.id === section.id);

    if (options.json) {
        console.log(formatJsonOutput(updatedSection, 'updated', {
            originalProject: await getProjectPath(api, section.projectId),
            newProject: updateData.project_id ? 
                await getProjectPath(api, updateData.project_id) : 
                undefined
        }));
    } else {
        console.log(`Section updated: ${updatedSection.name}`);
        console.log(`ID: ${updatedSection.id}`);
        if (updateData.project_id) {
            console.log(`From project: ${await getProjectPath(api, section.projectId)}`);
            console.log(`To project: ${await getProjectPath(api, updateData.project_id)}`);
        } else {
            console.log(`Project: ${await getProjectPath(api, updatedSection.projectId)}`);
        }
        if (updateData.order !== undefined) console.log(`New order: ${updateData.order}`);
    }
}

async function removeSection(api, sectionQuery, options) {
    let section;
    try {
        const sectionId = await resolveSectionId(api, sectionQuery);
        const sections = await api.getSections();
        section = sections.find(s => s.id === sectionId);
    } catch (error) {
        console.error(`Error: Section "${sectionQuery}" not found`);
        process.exit(1);
    }

    // Get tasks in the section before deletion
    const tasks = await api.getTasks({ sectionId: section.id });
    if (tasks.length > 0 && !options.force) {
        console.error(`Warning: Section "${section.name}" contains ${tasks.length} tasks:`);
        tasks.forEach(task => console.error(`  - ${task.content} (${task.id})`));
        console.error("\nThese tasks will be moved to the project root. Use --force to proceed.");
        process.exit(1);
    }

    // Move tasks to project root before deleting section
    if (tasks.length > 0) {
        console.log(`Moving ${tasks.length} tasks from section "${section.name}" to project root...`);
        const moveCommands = tasks.map(task => ({
            type: 'item_move',
            uuid: randomUUID(),
            args: {
                id: task.id.toString(),
                project_id: section.projectId.toString()  // Move to the section's project root
            }
        }));
        await executeSyncCommands(process.env.TODOIST_API_TOKEN, moveCommands);

        // Wait a moment for the move to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify tasks were moved successfully
        const movedTasks = await api.getTasks({ projectId: section.projectId });
        const taskIds = tasks.map(t => t.id);
        const survivingTasks = movedTasks.filter(task => taskIds.includes(task.id));
        
        if (survivingTasks.length !== tasks.length) {
            console.error("Error: Not all tasks were successfully moved to project root");
            process.exit(1);
        }
    }

    // Delete the section
    const command = {
        type: 'section_delete',
        uuid: randomUUID(),
        args: {
            id: section.id
        }
    };

    await executeSyncCommand(process.env.TODOIST_API_TOKEN, command);

    // Final verification of tasks
    const allTasks = await api.getTasks();
    const taskIds = tasks.map(t => t.id);
    const survivingTasks = allTasks.filter(task => taskIds.includes(task.id));

    if (options.json) {
        console.log(JSON.stringify({
            id: section.id,
            name: section.name,
            projectPath: await getProjectPath(api, section.projectId),
            tasksBeforeDeletion: tasks.map(t => ({ id: t.id, content: t.content })),
            tasksSurviving: survivingTasks.map(t => ({ 
                id: t.id, 
                content: t.content,
                projectId: t.projectId,
                sectionId: t.sectionId
            })),
            status: 'deleted'
        }, null, 2));
    } else {
        console.log(`Section deleted: ${section.name}`);
        console.log(`Project: ${await getProjectPath(api, section.projectId)}`);
        console.log(`ID: ${section.id}`);
        if (tasks.length > 0) {
            console.log(`\nTasks moved and verified: ${survivingTasks.length}/${tasks.length}`);
            if (survivingTasks.length > 0) {
                console.log("\nTasks now in project root:");
                survivingTasks.forEach(task => {
                    console.log(`  - ${task.content} (${task.id})`);
                });
            }
            if (survivingTasks.length !== tasks.length) {
                console.error("\nWARNING: Some tasks could not be verified after moving!");
            }
        }
    }
}

async function bulkRemoveSections(api, sectionQueries, options) {
    const sections = [];
    const allSections = await api.getSections();
    
    // Resolve all section queries first
    for (const query of sectionQueries) {
        const numericId = parseInt(query.trim());
        if (!isNaN(numericId)) {
            const section = allSections.find(s => s.id === numericId.toString());  // Convert to string for comparison
            if (section) {
                sections.push(section);
                continue;
            }
        }
        
        // If not a numeric ID, try to find by name
        const matchingSection = allSections.find(s => 
            s.name.toLowerCase() === query.trim().toLowerCase()
        );
        
        if (matchingSection) {
            sections.push(matchingSection);
        } else if (options.continueOnError) {
            console.error(`Warning: Section "${query}" not found, skipping...`);
        } else {
            console.error(`Error: Section "${query}" not found`);
            process.exit(1);
        }
    }

    if (sections.length === 0) {
        console.error("Error: No valid sections found to remove");
        process.exit(1);
    }

    // Get all tasks in these sections
    const tasksBySection = new Map();
    for (const section of sections) {
        const tasks = await api.getTasks({ sectionId: section.id });
        tasksBySection.set(section.id, tasks);
    }

    // Check if any sections have tasks and force isn't enabled
    if (!options.force) {
        let hasTasksToMove = false;
        for (const [sectionId, tasks] of tasksBySection.entries()) {
            if (tasks.length > 0) {
                const section = sections.find(s => s.id === sectionId);
                console.error(`Warning: Section "${section.name}" contains ${tasks.length} tasks:`);
                tasks.forEach(task => console.error(`  - ${task.content} (${task.id})`));
                hasTasksToMove = true;
            }
        }
        if (hasTasksToMove) {
            console.error("\nThese tasks will be moved to their respective project roots. Use --force to proceed.");
            process.exit(1);
        }
    }

    // Move all tasks to their project roots first
    const moveCommands = [];
    for (const [sectionId, tasks] of tasksBySection.entries()) {
        if (tasks.length > 0) {
            const section = sections.find(s => s.id === sectionId);
            console.log(`Moving ${tasks.length} tasks from section "${section.name}" to project root...`);
            moveCommands.push(...tasks.map(task => ({
                type: 'item_move',
                uuid: randomUUID(),
                args: {
                    id: task.id.toString(),
                    project_id: section.projectId.toString()  // Move to the section's project root
                }
            })));
        }
    }

    if (moveCommands.length > 0) {
        await executeSyncCommands(process.env.TODOIST_API_TOKEN, moveCommands);
    }

    // Delete all sections
    const deleteCommands = sections.map(section => ({
        type: 'section_delete',
        uuid: randomUUID(),
        args: {
            id: section.id
        }
    }));

    await executeSyncCommands(process.env.TODOIST_API_TOKEN, deleteCommands);

    // Verify tasks after deletion
    const allTasks = await api.getTasks();
    const taskVerification = new Map();
    
    for (const [sectionId, originalTasks] of tasksBySection.entries()) {
        const taskIds = originalTasks.map(t => t.id);
        const survivingTasks = allTasks.filter(task => taskIds.includes(task.id));
        taskVerification.set(sectionId, {
            original: originalTasks,
            surviving: survivingTasks
        });
    }

    if (options.json) {
        console.log(JSON.stringify({
            sections: await Promise.all(sections.map(async section => ({
                id: section.id,
                name: section.name,
                projectPath: await getProjectPath(api, section.projectId),
                tasksBeforeDeletion: tasksBySection.get(section.id).map(t => ({ 
                    id: t.id, 
                    content: t.content 
                })),
                tasksSurviving: taskVerification.get(section.id).surviving.map(t => ({ 
                    id: t.id, 
                    content: t.content,
                    projectId: t.projectId,
                    sectionId: t.sectionId
                }))
            }))),
            status: 'deleted',
            count: sections.length
        }, null, 2));
    } else {
        console.log(`\nRemoved ${sections.length} sections:`);
        for (const section of sections) {
            console.log(`\nSection: ${section.name}`);
            console.log(`ID: ${section.id}`);
            console.log(`Project: ${await getProjectPath(api, section.projectId)}`);
            
            const verification = taskVerification.get(section.id);
            if (verification.original.length > 0) {
                console.log(`Tasks moved and verified: ${verification.surviving.length}/${verification.original.length}`);
                if (verification.surviving.length > 0) {
                    console.log("Tasks now in project root:");
                    verification.surviving.forEach(task => {
                        console.log(`  - ${task.content} (${task.id})`);
                    });
                }
                if (verification.surviving.length !== verification.original.length) {
                    console.error("WARNING: Some tasks could not be verified after moving!");
                }
            }
        }
    }
}

async function main() {
    try {
        const argv = yargs(hideBin(process.argv))
            .usage('Usage: $0 <command> [options]')
            // Add section examples
            .example('$0 add "Planning 📋" --projectId "2349336695"', 'Add section to project')
            .example('$0 add "Sprint Backlog 📥" --projectId "2349336695" --order 1', 'Add section with specific order')
            // Bulk add examples
            .example('$0 bulk-add --names "Sprint 1 🏃" "Sprint 2 🏃" --projectId "2349336695"', 'Add multiple sections')
            .example('$0 bulk-add --names "Todo 📋" "In Progress 🔄" "Done ✅" --projectId "2349336695" --start-order 1', 'Add ordered sections')
            // Update examples
            .example('$0 update "183758533" --name "Active Sprint 🏃" --order 1', 'Update section name and order')
            .example('$0 update "183758533" --projectId "2349336695"', 'Move section to different project')
            // Remove examples
            .example('$0 remove --section "183758533" --force', 'Remove section and move tasks to project root')
            .example('$0 bulk-remove --sections "183758533" "183758534" --force', 'Remove multiple sections')
            .command('add', 'Add a new section', {
                name: {
                    description: 'Section name',
                    type: 'string',
                    demandOption: true
                },
                projectId: {
                    description: 'Project ID to add section to',
                    type: 'string',
                    demandOption: true,
                    coerce: String
                },
                order: {
                    description: 'Section order (optional)',
                    type: 'number'
                },
                json: {
                    description: 'Output in JSON format',
                    type: 'boolean',
                    default: false
                }
            })
            .command('bulk-add', 'Add multiple sections', {
                names: {
                    description: 'Section names (space-separated, use quotes for multi-word names)',
                    type: 'array',
                    string: true,
                    demandOption: true
                },
                projectId: {
                    description: 'Project ID to add sections to',
                    type: 'string',
                    demandOption: true,
                    coerce: String
                },
                startOrder: {
                    description: 'Starting order for sections (will increment for each section)',
                    type: 'number'
                },
                json: {
                    description: 'Output in JSON format',
                    type: 'boolean',
                    default: false
                }
            })
            .command('update', 'Update a section', {
                section: {
                    description: 'Section ID to update',
                    type: 'string',
                    demandOption: true
                },
                name: {
                    description: 'New section name',
                    type: 'string'
                },
                projectId: {
                    description: 'Move section to project ID',
                    type: 'string',
                    coerce: String
                },
                order: {
                    description: 'New section order',
                    type: 'number'
                },
                json: {
                    description: 'Output in JSON format',
                    type: 'boolean',
                    default: false
                }
            })
            .command('remove', 'Remove a section', {
                section: {
                    description: 'Section ID to remove',
                    type: 'string',
                    demandOption: true
                },
                force: {
                    description: 'Force removal even if section contains tasks',
                    type: 'boolean',
                    default: false
                },
                json: {
                    description: 'Output in JSON format',
                    type: 'boolean',
                    default: false
                }
            })
            .command('bulk-remove', 'Remove multiple sections', {
                sections: {
                    description: 'Section IDs to remove (space-separated)',
                    type: 'array',
                    string: true,
                    demandOption: true
                },
                force: {
                    description: 'Force removal even if sections contain tasks',
                    type: 'boolean',
                    default: false
                },
                continueOnError: {
                    description: 'Continue if some sections are not found',
                    type: 'boolean',
                    default: false
                },
                json: {
                    description: 'Output in JSON format',
                    type: 'boolean',
                    default: false
                }
            })
            .epilogue(
                'Notes:\n' +
                '  - Section operations use the Sync API for better reliability\n' +
                '  - Tasks in deleted sections are preserved by moving them to the project root\n' +
                '  - Use --force to remove sections containing tasks\n' +
                '  - Section IDs are recommended over names for more reliable targeting\n' +
                '  - The order parameter determines section position (lower numbers appear first)\n' +
                '  - When moving tasks between sections, task metadata is preserved'
            )
            .demandCommand(1, 'You must provide a valid command')
            .help()
            .argv;

        const api = await initializeApi();

        switch (argv._[0]) {
            case 'add':
                await addSection(api, argv.name, {
                    projectId: argv.projectId,
                    order: argv.order,
                    json: argv.json
                });
                break;
            case 'bulk-add':
                await bulkAddSections(api, argv.names, {
                    projectId: argv.projectId,
                    startOrder: argv.startOrder,
                    json: argv.json
                });
                break;
            case 'update':
                await updateSection(api, argv.section, {
                    name: argv.name,
                    projectId: argv.projectId,
                    order: argv.order,
                    json: argv.json
                });
                break;
            case 'remove':
                await removeSection(api, argv.section, {
                    force: argv.force,
                    json: argv.json
                });
                break;
            case 'bulk-remove':
                await bulkRemoveSections(api, argv.sections, {
                    force: argv.force,
                    continueOnError: argv.continueOnError,
                    json: argv.json
                });
                break;
        }
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    main();
}

export { addSection, bulkAddSections, updateSection, removeSection, bulkRemoveSections }; 