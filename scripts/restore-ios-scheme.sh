#!/bin/bash

# Restore iOS shared scheme that gets removed by cap sync
echo "Checking for iOS shared scheme..."

SCHEME_DIR="ios/App/App.xcodeproj/xcshareddata/xcschemes"
SCHEME_FILE="$SCHEME_DIR/App.xcscheme"

mkdir -p "$SCHEME_DIR"

if [ ! -f "$SCHEME_FILE" ]; then
  echo "Scheme missing, restoring from git..."
  git checkout "$SCHEME_FILE" || {
    echo "Warning: Could not restore scheme from git"
    exit 0
  }
  echo "Scheme restored successfully"
else
  echo "Scheme already exists"
fi
