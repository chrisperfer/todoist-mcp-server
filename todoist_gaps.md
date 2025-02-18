## Missing Functionality

- **Update Task Tags/Labels**: Currently there is no tool to add, remove, or modify tags/labels on existing tasks. This would be useful for tasks like adding the "Next" and "AI" tags to tasks. 
- **Batch Task Updates**: No capability to update multiple tasks at once, requiring individual commands for each task update.
  - The Todoist Sync API actually supports batch operations via its `commands` array
  - Current implementation in `update-task.js` only sends one command at a time
  - Could be improved by:
    - Creating a new `batch-update-tasks.js` tool
    - Modifying existing tools to support batching
    - Using a single Sync API request with multiple commands for better performance
    - Example structure:
      ```javascript
      {
          commands: [
              {
                  type: 'item_update',
                  uuid: uuid1,
                  args: { id: task1.id, section_id: targetSection.id }
              },
              {
                  type: 'item_update',
                  uuid: uuid2,
                  args: { id: task2.id, section_id: targetSection.id }
              }
          ]
      }
      ```
- **Section Management**: 
  - No command to move multiple tasks to a section in one operation
  - No way to reorder tasks within sections
  - No structured way to view tasks organized by sections (current list-tasks shows all tasks chronologically)
- **Task Organization**: 
  - Limited ability to perform bulk operations on tasks
  - No way to verify section assignments in a structured way
  - No easy way to view section hierarchy and task distribution 
- **Project Organization Tools**:
  - No template system for common project structures (e.g., health project sections, work project layouts)
  - Missing project analysis tools:
    - Task distribution across sections
    - Due date clustering
    - Priority distribution
    - Label usage patterns
  - No way to clone/duplicate project structure (sections without tasks)
  - No tools for suggesting task categorization based on content or patterns
- **Visualization and Reporting**:
  - No visual representation of project structure
  - Missing task distribution charts
  - No reporting on project organization health
  - No way to compare project structures
- **Smart Organization Features**:
  - No AI-assisted task categorization
  - Missing pattern recognition for task organization
  - No automatic section suggestions based on task content
  - No tools for identifying tasks that might be miscategorized
  - No automatic priority suggestions based on due dates and task patterns
- **Bulk Operations**:
  - No mass priority updates
  - No bulk due date adjustments
  - Missing tools for reorganizing multiple projects simultaneously
  - No way to apply consistent structure across multiple projects
  - No tools for merging or splitting sections 