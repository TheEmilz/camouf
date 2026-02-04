FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY --from=builder /app/dist ./dist

# Set executable permissions
RUN chmod +x ./dist/cli/index.js

# Create volume for project to analyze
VOLUME ["/project"]

WORKDIR /project

# Set entrypoint
ENTRYPOINT ["node", "/app/dist/cli/index.js"]

# Default command
CMD ["--help"]
