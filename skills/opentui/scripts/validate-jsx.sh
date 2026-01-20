#!/bin/bash
# Validates JSX pragma in all .tsx files
# Returns non-zero exit code if any files are missing the pragma

echo "Checking for @jsxImportSource pragma in .tsx files..."

MISSING=$(grep -rL "@jsxImportSource @opentui/solid" --include="*.tsx" src/ 2>/dev/null)

if [ -n "$MISSING" ]; then
    echo "ERROR: The following files are missing the JSX pragma:"
    echo "$MISSING"
    echo ""
    echo "Add this line as the FIRST line of each .tsx file:"
    echo '/** @jsxImportSource @opentui/solid */'
    exit 1
else
    echo "All .tsx files have the correct JSX pragma."
    exit 0
fi
