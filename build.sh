#!/bin/bash
set -e

echo "Building frontend with Vite..."
npx vite build

echo "Copying production server..."
cp server/production.js dist/production.js

echo "Build complete!"