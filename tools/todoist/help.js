const COMMANDS = {
  find: {
    description: 'Find tasks using Todoist filters',
    usage: 'find.js <filter> [--ids] [--json]',
    examples: [
      'find.js "p:FLOOBY & @test"     # Find tasks in FLOOBY project with @test label',
      'find.js "overdue" --ids | xargs task.js batch-update --taskIds --priority 1     # Set priority for overdue tasks',
      'find.js "today | tomorrow"     # Find tasks due today or tomorrow',
      'find.js "search: meeting"      # Find tasks containing "meeting"',
      'find.js "@work & p:FLOOBY"     # Find work-labeled tasks in FLOOBY project',
      'find.js "p:FLOOBY & /Planning"  # Find tasks in Planning section of FLOOBY project',
      'find.js "p:FLOOBY & !/Planning" # Find tasks NOT in Planning section of FLOOBY project',
      'find.js "p:FLOOBY & (/Planning | /Development)" # Find tasks in either Planning or Development sections',
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
      'Use --json for programmatic processing or data export',
      'Section filtering:',
      '  - /SectionName     Filter tasks in a specific section',
      '  - !/SectionName    Filter tasks NOT in a specific section',
      '  - (/Section1 | /Section2)  Filter tasks in either section'
    ]
  }
}; 