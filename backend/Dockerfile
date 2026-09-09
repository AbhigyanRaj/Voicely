# Node 20: pino v10 needs diagnostics_channel.tracingChannel, added in 20.
# .nvmrc and CI both pin 20; this image was pinned to 18.
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with production flag
# --omit=dev; --only=production is deprecated in npm 9+.
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S vokai -u 1001

# Change ownership
RUN chown -R vokai:nodejs /app
USER vokai

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  # /api/health does not exist -- everything is mounted under /api/v1 -- so this
  # probe 404'd and the container reported unhealthy forever.
  CMD node -e "require('http').get('http://localhost:10000/api/v1/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]
