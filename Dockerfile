# FreshRelay — production image (multi-stage)
#
# The app is a single Next.js 16 (App Router) service with an embedded jobs
# worker (src/instrumentation.ts). Point DATABASE_URL at any PostgreSQL 16
# instance — see docker-compose.yml for the local stack.

# ---------- deps + build ----------
FROM oven/bun:1 AS builder
WORKDIR /app

# Install dependencies first (cached layer; postinstall runs prisma generate)
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# Build the app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/freshrelay
RUN bun run lint && bun run build

# ---------- runtime ----------
FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/.next ./.next
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/prisma ./prisma
COPY --from=builder --chown=bun:bun /app/package.json ./package.json

USER bun
EXPOSE 3000

# Push schema (idempotent) then start. For a fresh database run
# `docker compose exec app bun prisma/seed.ts` once to load demo data.
CMD ["sh", "-c", "bunx prisma db push --skip-generate --accept-data-loss && bun run start"]
