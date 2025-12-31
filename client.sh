#!/bin/bash
# Soft Delivery Client Wrapper for Linux/macOS
# Usage: ./client.sh <command> [options]

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo "Error: Bun is not installed or not in PATH"
    echo "Please install Bun from https://bun.sh"
    exit 1
fi

# Check if client.ts exists
if [ ! -f "$SCRIPT_DIR/client.ts" ]; then
    echo "Error: client.ts not found"
    exit 1
fi

# Check if config exists
if [ ! -f "$SCRIPT_DIR/client.config.json" ]; then
    echo "Warning: client.config.json not found"
    echo "Please copy client.config.example.json to client.config.json and configure it"
fi

# Run the client
cd "$SCRIPT_DIR"
bun run client.ts "$@"
