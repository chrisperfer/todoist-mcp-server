const COMMANDS = {
  find: {
    description: 'Find tasks using Todoist filters',
    usage: 'find.js <filter> [--ids] [--json]',
    examples: [
      'find.js "p:FLOOBY & @test"     # Find tasks in FLOOBY project with @test label',
      'find.js "overdue" --ids        # Get IDs of overdue tasks (useful for piping)',
      'find.js "today | tomorrow"     # Find tasks due today or tomorrow',
      'find.js "search: meeting"      # Find tasks containing "meeting"',
      'find.js "@work & p:FLOOBY"     # Find work-labeled tasks in FLOOBY project'
    ],
    options: {
      '--ids': 'Output only task IDs (one per line)',
      '--json': 'Output in JSON format with enhanced task information'
    },
    notes: [
      'For filter syntax, see: https://todoist.com/help/articles/205280588-search-and-filter',
      'Default output shows task content, project path, section name, parent task, and labels',
      'The --ids option is useful for piping task IDs to other commands',
      'The --json option includes project paths and section names in the output',
      'Cannot use both --ids and --json options together'
    ]
  }
}; 