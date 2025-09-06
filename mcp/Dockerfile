# Multi-stage build for MCP Server
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy environment example
COPY .env.example ./.env.example

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/mcp/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start the OAuth server by default
CMD ["node", "dist/http-server-oauth.js"]