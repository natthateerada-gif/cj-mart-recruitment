# CJ Mart recruitment site — production image.
#   docker build -t cjmart-recruitment .
#   docker run -p 3000:3000 --env-file .env cjmart-recruitment
# All configuration comes from environment variables (see .env.example);
# nothing in the code needs editing to deploy.

FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    SEED_SAMPLE_DATA=0

WORKDIR /app

# Install only runtime dependencies (cached unless package*.json change).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY db ./db
COPY scripts ./scripts
COPY src ./src
COPY public ./public

# Run as the unprivileged "node" user that ships with the base image.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entry point applies pending database migrations, then starts the server.
CMD ["sh", "scripts/docker-entrypoint.sh"]
