## Missing Functionality

- **Task Organization**: 
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
- **API Inconsistencies**:
  - Section handling differs between REST API and Sync API:
    - REST API's `getSections()` sometimes fails to return sections that exist
    - Sync API correctly handles section operations with section IDs
    - Need to consider using Sync API more consistently for section operations
    - Current workaround: Skip section validation and rely on section IDs from task data
  - No unified approach for section operations across the codebase 

## Project Management Gaps

1. Project Creation:
   - ✅ Changed add-project.js to use --parentId instead of name matching
   - Need to add validation for color values and other parameters
   - Consider adding support for bulk project creation

2. Project Deletion:
   - Missing delete-project.js tool
   - Need ability to delete projects by ID
   - Consider safety checks (e.g., confirmation for non-empty projects)

3. Project Updates:
   - Current update-project.js uses loose name matching
   - Should be updated to use exact IDs like add-project.js
   - Need better error messages for API failures

4. General Project Tool Improvements:
   - Add consistent parameter naming (e.g., projectId vs project_id)
   - Add validation for all project parameters
   - Improve error handling and user feedback
   - Add support for bulk operations 

## Gaps Found During Elaboration Testing

1. Label Removal Issues
   - Current tools don't provide a reliable way to remove labels from tasks
   - Need to add functionality to remove labels from individual tasks
   - Consider adding a `--clear-labels` option to the task update command


3. Task Cleanup
   - No easy way to delete duplicate tasks
   - Consider adding a batch-delete command for cleaning up tasks
   - Could use filters to identify and remove duplicates 

## Gaps Found During Batch Labeling Testing

1. Search Term Limitations
   - Complex search terms with special characters (e.g., "Home & Furniture") fail with 400 errors
   - Multiple search terms in batch-label sometimes fail to find tasks that exist
   - Need better handling of spaces and special characters in search queries

2. Label Application Verification
   - No easy way to verify all tasks that should have a label actually received it
   - No tool to show tasks grouped by label for quick verification
   - Missing functionality to show "unlabeled" tasks in a project

3. Smart Labeling Features
   - No way to suggest labels based on task content or categories
   - Category headers (e.g., "🏠 Home & Furniture") could automatically suggest labels for contained tasks
   - No bulk labeling based on task relationships (e.g., label all tasks in a category)

4. Label Management
   - No way to see label distribution within a project
   - Missing tools to identify inconsistent labeling patterns
   - No way to batch modify or replace labels (e.g., replace one label with another)

## API Migration Needs

Current tools still using REST API that need migration to Sync API:

1. Project Management Tools:
   - list-projects.js: Basic project listing
   - add-project.js: Project creation
   - update-project.js: Project updates
   - move-project.js: Project hierarchy management
   Benefit of migration: Better batch operations and more reliable project hierarchy management

2. Section Management Tools:
   - list-sections.js: Section listing
   - add-section.js: Section creation
   - remove-section.js: Section deletion
   Benefit of migration: More reliable section operations, consistent with task.js approach

3. Label Management:
   - list-labels.js: Label listing
   Benefit of migration: Consistent API usage across all label operations

4. Task Listing Tools:
   - list-tasks.js: Basic task listing
   - search.js: Task searching
   Benefit of migration: Better filtering capabilities and consistent data structure

Reasons for Migration:
- Sync API provides more reliable section handling
- Better support for batch operations
- More consistent behavior across operations
- Richer filtering capabilities
- Better performance for bulk operations
- Reduced API calls for complex operations
- More reliable real-time state management

Migration Priorities:
1. Section management tools (highest priority due to known issues)
2. Project management tools (to support batch operations)
3. Task listing tools (for better filtering)
4. Label management (for consistency)

Implementation Notes:
- Each tool will need to be updated to use sync commands
- Need to maintain backward compatibility during migration
- Should add proper error handling for sync-specific issues
- Consider adding batch operation support where applicable
- Update documentation to reflect Sync API usage

## Unused Sync API Features

High-value features from the Sync API that we're not currently utilizing:

1. Batching Commands
   - Current Implementation: Making individual API calls for most operations
   - API Capability: Up to 100 commands per request
   - Potential Benefits:
     - Significantly reduced API calls for bulk operations
     - Better performance for mass updates
     - Enable true bulk operations across projects
   - Use Cases:
     - Mass priority updates
     - Bulk task moves
     - Project structure cloning
     - Section reorganization

2. Templates API
   - Current Implementation: No template support
   - API Capability: Import/Export template files, shareable URLs
   - Potential Benefits:
     - Standardized project structures
     - Easy sharing of successful layouts
     - Quick project setup
   - Use Cases:
     - Health project sections
     - Work project layouts
     - Common project structures

3. Activity Logs API
   - Current Implementation: No activity tracking
   - API Capability: Detailed activity logs with pagination
   - Potential Benefits:
     - Project health monitoring
     - Usage pattern analysis
     - Task distribution insights
   - Use Cases:
     - Project organization analysis
     - Task distribution charts
     - Workflow optimization

Implementation Considerations:
- Batching should be prioritized during Sync API migration
- Templates could be implemented alongside project management improvements
- Activity logs could enable many of our desired reporting features

## API Inconsistencies

Current inconsistencies across tools that need standardization:

1. Parameter Naming
   - Inconsistent case styles (camelCase vs snake_case)
   - Examples:
     - project_id vs projectId
     - parent_id vs parentId
     - section_id vs sectionId
   - Need to standardize on one style across all tools

2. Command Line Arguments
   - Inconsistent parameter prefixes
   - Examples:
     - --projectId vs --project-id
     - --parentId vs --parent
     - --filter vs --query
   - Need consistent parameter naming convention

3. ID Resolution
   - Mixed approaches to entity lookup:
     - Some tools require exact IDs
     - Others allow name matching
     - Some support both with unclear precedence
   - Need consistent approach to ID resolution

4. Output Formatting
   - Inconsistent output styles:
     - Some tools default to JSON
     - Others use formatted text
     - Different error message formats
   - Need standardized output format with consistent --json flag behavior

5. Error Handling
   - Various approaches to error reporting:
     - Some tools exit immediately
     - Others collect and report multiple errors
     - Inconsistent error message formatting
   - Need unified error handling strategy

6. API Pattern Usage
   - Mixed use of REST and Sync APIs
   - Inconsistent validation approaches
   - Different batching strategies
   - Need consistent patterns across tools

Standardization Priorities:
1. Establish consistent parameter naming convention
2. Standardize ID resolution approach
3. Unify output and error handling
4. Document and enforce API usage patterns

Implementation Notes:
- Create shared utility functions for common operations
- Update all tools to follow consistent patterns
- Add validation for standardized parameter names
- Consider creating a tool template for future additions

### CLI Argument Handling

Current State:
- Manual argument parsing in most tools
- Inconsistent parameter validation
- Varying help text formats
- Different approaches to type coercion
- No standardized way to handle common flags (e.g., --json)

Recommended Solution - Yargs Integration:
1. Benefits:
   - Built-in parameter validation
   - Consistent help text generation
   - Type coercion for IDs
   - Middleware support for common validations
   - Shared option definitions

2. Standard Options Pattern:
```javascript
const commonOptions = {
  json: {
    type: 'boolean',
    description: 'Output as JSON',
    default: false
  },
  projectId: {
    type: 'string',
    description: 'Project ID',
    coerce: validateProjectId
  }
};
```

3. Common Validations:
   - Token validation
   - ID format checking
   - Required parameter verification
   - Type coercion
   - Filter syntax validation

4. Standardized Help Text:
   - Consistent command description format
   - Standard examples section
   - Common parameter documentation
   - Uniform error messages

Implementation Priority:
1. Create shared options and validation library
2. Convert highest-use tools first (task.js, project tools)
3. Standardize help text format
4. Add common middleware for token/auth checks

Migration Strategy:
- Create template for new tool structure
- Update tools one at a time
- Add comprehensive tests for parameter handling
- Document common patterns and options 

## Documentation Organization Gaps

1. Documentation Distribution:
   - Documentation currently spread across multiple locations:
     * README.md (project overview and examples)
     * package.json toolDocs (detailed command reference)
     * --help CLI output (immediate guidance)
   - Challenges:
     * Maintenance overhead
     * Risk of inconsistency
     * Potentially overwhelming --help output
     * No clear hierarchy of documentation

2. Proposed Improvements:
   - Implement tiered documentation approach:
     * Streamlined --help for common options
     * New --help-all for comprehensive reference
     * Generate both from toolDocs automatically
   - Clarify documentation roles:
     * README.md: Getting started only
     * toolDocs: Single source of truth
     * CLI help: Quick reference with pointers to full docs

3. Implementation Needs:
   - Documentation generation system
   - Clear separation of concerns between doc types
   - Automated consistency checking
   - Better help output formatting
   - Links between documentation levels 

## Task Tool Improvements Needed

1. Update ID Resolution Functions
   - Current: `findTask`, `resolveTaskId`, `resolveProjectId`, and `resolveSectionId` support both IDs and names
   - Need: Remove name matching to enforce ID-only usage
   - Files to update: 
     * `tools/todoist/lib/task-utils.js`
     * `tools/todoist/lib/id-utils.js`
   - This aligns with other tools in the codebase and removes ambiguity
   - Will require users to use list commands to find IDs first 

2. Fix Parameter Name Mismatch in addTask ✅
   - Current: CLI uses projectId/sectionId/parentId but function expects project/section/parent
   - Tasks are being created in Inbox because parameters aren't being passed correctly
   - Need to update addTask function to match new parameter names
   - Files to update:
     * `tools/todoist/task.js`
   - This is causing tasks to be created in Inbox instead of specified locations
   - Fixed: Updated parameter names and improved output to always show location information

3. Enhance Task Creation Output ✅
   - Always show where a task was created (project/section/parent)
   - Include project name even if it's Inbox
   - Make JSON output include full location information
   - Consider adding similar location output improvements to move/update commands
   - Fixed: Now showing complete location information for task creation

4. Test All Subcommands ✅
   - Need to verify all subcommands work correctly with IDs:
     * move ✅ - Works correctly with section IDs
     * batch-move ✅ - Works but needs simpler filters
     * update ✅ - Works correctly for content and priority
     * batch-add ✅ - Works correctly with sections and priorities
   - Test specifically in FLOOBY project
   - Verify correct project/section inheritance
   - Check output formatting and location information
   - Note: Complex filters in batch-move (e.g., "p:Project & search:term") don't work well
   - Consider improving filter handling in batch operations

5. Filter Handling Improvements Needed
   - Complex filters don't work well in batch operations
   - Combining project filters with search terms fails
   - Need to document working filter patterns
   - Consider adding filter validation/preprocessing
   - Examples of problematic filters:
     * "p:Project & search:term"
     * Multiple search terms
     * Special characters in search

6. Section Validation Workaround Added ✅
   - REST API's getSections() is unreliable for validation
   - Added commented code showing ideal validation
   - Currently skipping validation and trusting section IDs
   - Updated help examples to show all tested use cases
   - Added note about simple filters being more reliable
   - Long-term fix: Migrate to Sync API for section operations

## Documentation Organization Gaps

1. Documentation Distribution:
   - Documentation currently spread across multiple locations:
     * README.md (project overview and examples)
     * package.json toolDocs (detailed command reference)
     * --help CLI output (immediate guidance)
   - Challenges:
     * Maintenance overhead
     * Risk of inconsistency
     * Potentially overwhelming --help output
     * No clear hierarchy of documentation

2. Proposed Improvements:
   - Implement tiered documentation approach:
     * Streamlined --help for common options
     * New --help-all for comprehensive reference
     * Generate both from toolDocs automatically
   - Clarify documentation roles:
     * README.md: Getting started only
     * toolDocs: Single source of truth
     * CLI help: Quick reference with pointers to full docs

3. Implementation Needs:
   - Documentation generation system
   - Clear separation of concerns between doc types
   - Automated consistency checking
   - Better help output formatting
   - Links between documentation levels 