#!/bin/bash

# Get the absolute path to the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Source the environment variables from .env file
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
else
    echo "Error: .env file not found. Please copy .env.example to .env and set your Todoist API token."
    exit 1
fi

# Run the MCP server
node "$SCRIPT_DIR/dist/index.js" "$@" 