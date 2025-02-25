#!/bin/bash

# Set the Todoist API token
export TODOIST_API_TOKEN="fdebb665194ea019e3362061d94c4502678576a5"

# Get the absolute path to the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run the MCP server
node "$SCRIPT_DIR/dist/index.js" "$@" 