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

# Install all dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy all application files
COPY . .

# Build the application
RUN npm run build

# Start the app (migrations run automatically in server/index.ts)
CMD ["npm", "run", "start"]

# Expose port
EXPOSE 5000
