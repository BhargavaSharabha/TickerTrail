FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy workspace manifest + lock file
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/

# Install only frontend workspace package deps
RUN pnpm install --filter @crypto-streamer/frontend --frozen-lockfile

# Copy frontend source
COPY frontend/ ./frontend/

WORKDIR /app/frontend

ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
