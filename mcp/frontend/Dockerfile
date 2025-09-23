# Multi-stage build for React frontend with Node.js backend
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Accept build arguments
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copy source code
COPY . .

# Build the React application
RUN npm run build

# Production stage with Node.js server
FROM node:20-alpine

# Install nginx and supervisor for running multiple processes
RUN apk add --no-cache nginx supervisor

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy server files
COPY server.js ./
COPY .env* ./

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy nginx configuration
COPY nginx.conf /etc/nginx/http.d/default.conf

# Create supervisor configuration
RUN cat > /etc/supervisord.conf << 'EOF'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid

[program:nginx]
command=/usr/sbin/nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:node-server]
command=node /app/server.js
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production"
EOF

# Create nginx directories and copy static files
RUN mkdir -p /run/nginx /usr/share/nginx/html
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose ports
EXPOSE 80 3001

# Health check for both services
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health && \
      wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start supervisor to run both nginx and node server
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]