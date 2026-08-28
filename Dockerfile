# Use Node.js 20 base image
FROM node:20-slim

# Install PostgreSQL client for Drizzle
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Railway may inject production-mode npm settings during image builds. Vite,
# esbuild, and TypeScript are build-time dev dependencies, so force npm into
# build mode and verify the required executables exist before continuing.
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false
ENV NPM_CONFIG_OMIT=
RUN npm_config_registry=https://registry.npmjs.org \
    npm_config_replace_registry_host=always \
    npm ci --include=dev \
    && test -x node_modules/.bin/vite \
    && test -x node_modules/.bin/esbuild

# Copy all application files
COPY . .

# Build the application
RUN npm run build

# The compiled server runs in production mode.
ENV NODE_ENV=production

# Start the app (migrations run automatically in server/index.ts)
CMD ["npm", "run", "start"]

# Expose port
EXPOSE 5000
