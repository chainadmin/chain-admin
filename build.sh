#!/bin/bash
set -e

echo "Building frontend with Vite..."
npx vite build

echo "Building production server with esbuild..."
npx esbuild server/prod.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --sourcemap

echo "Build complete!"