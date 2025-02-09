#!/usr/bin/env node

import { TodoistApi } from '@doist/todoist-api-typescript';
import url from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Simple workflow engine
async function executeWorkflow(workflow, context = {}) {
    const state = { ...context };
    
    for (const step of workflow.steps) {
        console.log(`\nExecuting step: ${step.type}\n`);
        
        switch (step.type) {
            case 'action':
                if (step.tool === 'list-tasks') {
                    const { stdout } = await execAsync(`node tools/todoist/list-tasks.js --project "${step.params.project}"`);
                    state[step.output_var] = stdout;
                }
                break;
                
            case 'analysis':
                console.log(`<analysis_request>`);
                console.log(`Context for analysis:\n`);
                for (const [key, value] of Object.entries(step.context)) {
                    if (typeof value === 'function') {
                        console.log(`${key}:\n${value(state)}\n`);
                    } else {
                        console.log(`${key}:\n${value}\n`);
                    }
                }
                console.log(`\n${step.request}`);
                console.log(`</analysis_request>`);
                // In a real implementation, we'd wait for AI response here
                break;
                
            case 'action_request':
                console.log(`<action_request>`);
                console.log(step.request);
                console.log(`</action_request>`);
                break;
        }
    }
    
    return state;
}

async function autoTagger(options = {}) {
    try {
        const token = process.env.TODOIST_API_TOKEN;
        if (!token) {
            console.error("Error: TODOIST_API_TOKEN environment variable is required");
            process.exit(1);
        }
        
        const api = new TodoistApi(token);

        try {
            // Get all projects and labels
            const [projects, labels] = await Promise.all([
                api.getProjects(),
                api.getLabels()
            ]);

            // Find the target project (default to Inbox)
            const projectName = options.project || 'Inbox';
            const project = projects.find(p => 
                p.name.toLowerCase() === projectName.toLowerCase()
            );

            if (!project) {
                console.error(`Error: Project "${projectName}" not found`);
                process.exit(1);
            }

            // Get goal labels
            const goalLabels = labels
                .filter(l => l.name.startsWith('Goals:'))
                .map(l => l.name);

            // Define the workflow
            const workflow = {
                name: "Auto-Tag Tasks",
                steps: [
                    {
                        type: 'action',
                        tool: 'list-tasks',
                        output_var: 'tasks',
                        params: {
                            project: projectName
                        }
                    },
                    {
                        type: 'analysis',
                        context: {
                            'Available Goals': goalLabels.join('\n'),
                            'Tasks': state => state.tasks
                        },
                        request: 'Please analyze each task and suggest appropriate Goal labels from the available goals. For each task, provide the task ID and the suggested goals.',
                    },
                    {
                        type: 'action_request',
                        request: 'Please apply the suggested goal labels to each task using the update-task tool.'
                    }
                ]
            };

            // Execute the workflow
            await executeWorkflow(workflow, { goalLabels });

        } catch (apiError) {
            console.error("API Error:", apiError.message);
            throw apiError;
        }
    } catch (error) {
        console.error("Error in script:", error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    project: null
};

// Parse project name if provided
const projectIndex = args.findIndex(arg => arg === '--project');
if (projectIndex !== -1 && projectIndex + 1 < args.length) {
    options.project = args[projectIndex + 1];
}

// Run if called directly
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
    autoTagger(options);
}

export { autoTagger }; 