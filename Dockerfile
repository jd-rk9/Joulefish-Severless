# Use a Node.js 20 base image
FROM node:20-slim AS builder

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including devDependencies for build
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend and backend
RUN npm run build

# Use a smaller image for production
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy the built assets from the builder stage
COPY --from=builder /app/dist ./dist

# Expose the port from docker-compose
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]
