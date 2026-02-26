FROM mcr.microsoft.com/playwright:v1.40.1-jammy

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifest + root package.json + lock file
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json ./backend/

# Install only backend workspace package deps
RUN pnpm install --filter @crypto-streamer/backend --frozen-lockfile

# Copy backend source
COPY backend/ ./backend/

WORKDIR /app/backend

ENV PORT=8080
ENV PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

EXPOSE 8080
CMD ["pnpm", "start"]
