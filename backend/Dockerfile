# syntax=docker/dockerfile:1

# ---------- Stage 1: deps ----------
FROM node:22-alpine AS deps
# openssl dibutuhkan schema engine Prisma (dipakai target migrator).
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- Stage 2: builder ----------
FROM deps AS builder
COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate \
 && npm run build \
 && npm prune --omit=dev

# ---------- Target terpisah: migrator ----------
# Bukan bagian image produksi. Menjalankan `prisma migrate deploy` sebagai
# pemilik skema (MIGRATION_DATABASE_URL). Dipakai: docker compose run --rm migrate
FROM deps AS migrator
COPY prisma.config.ts ./
COPY prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- Stage 3: runner ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
# File dimiliki root dan hanya bisa dibaca oleh user node (+ read_only di compose).
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
