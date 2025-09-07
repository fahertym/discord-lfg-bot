# syntax=docker/dockerfile:1.7

# -------- Base image with Node and pnpm (via Corepack) --------
FROM node:22-alpine AS base
WORKDIR /app
# Enable corepack and prepare PNPM matching packageManager in package.json
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

# -------- Dependencies layer (dev + prod) --------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# -------- Build layer --------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# -------- Production dependencies only --------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# -------- Production image --------
FROM base AS runner
# Create non-root user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

ENV NODE_ENV=production
# Copy production node_modules and built dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json

# App runs with environment variables; no .env copied
CMD ["node", "dist/index.js"]


