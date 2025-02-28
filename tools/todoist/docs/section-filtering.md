# Section Filtering in Todoist MCP

This document provides detailed information about filtering tasks by section in Todoist MCP.

## Basic Syntax

To filter tasks by section, use the following syntax:

```
/SectionName
```

For example, to find all tasks in the "Planning" section:

```bash
node tools/todoist/find.js "/Planning"
```

## Combining with Project Filters

Section filters are most useful when combined with project filters:

```bash
node tools/todoist/find.js "p:FLOOBY & /Planning"
```

This finds all tasks in the "Planning" section of the "FLOOBY" project.

## Excluding Sections

To find tasks that are NOT in a specific section, use the negation operator:

```bash
node tools/todoist/find.js "p:FLOOBY & !/Planning"
```

This finds all tasks in the "FLOOBY" project that are NOT in the "Planning" section.

## Complex Section Filtering

You can create complex filters using parentheses and logical operators:

### OR Operation

Find tasks in either the "Planning" or "Development" sections:

```bash
node tools/todoist/find.js "p:FLOOBY & (/Planning | /Development)"
```

### AND Operation

Find tasks that match multiple conditions:

```bash
node tools/todoist/find.js "p:FLOOBY & /Planning & @important"
```

This finds tasks in the "Planning" section of the "FLOOBY" project that also have the "important" label.

## Common Patterns

### Finding Tasks in Multiple Sections

```bash
node tools/todoist/find.js "p:FLOOBY & (/Planning | /Development | /Testing)"
```

### Excluding Multiple Sections

```bash
node tools/todoist/find.js "p:FLOOBY & !(/Planning | /Completed)"
```

This finds tasks in the "FLOOBY" project that are NOT in either the "Planning" or "Completed" sections.

### Combining with Other Filters

```bash
node tools/todoist/find.js "p:FLOOBY & /Development & due:today"
```

This finds tasks in the "Development" section of the "FLOOBY" project that are due today.

## Notes

- Section names are case-sensitive and must match exactly
- Use quotes around filters with spaces
- The syntax `/SectionName` is the correct format (not `s:SectionName`)
- Section filtering works with the `--ids` and `--json` options
- For batch operations, combine with the `--ids` parameter:

```bash
node tools/todoist/find.js "p:FLOOBY & /Planning" --ids | xargs node tools/todoist/task.js batch-update --taskIds --priority 1
```

This sets priority 1 for all tasks in the "Planning" section of the "FLOOBY" project. 