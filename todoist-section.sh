#!/bin/bash

# Set the Todoist API token
export TODOIST_API_TOKEN="fdebb665194ea019e3362061d94c4502678576a5"

# Run the section.js script with all passed arguments
node "$(dirname "$0")/tools/todoist/section.js" "$@" 