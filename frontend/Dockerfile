# syntax=docker/dockerfile:1
# Butuh kerangka Vite dari Adli (package.json, package-lock.json, src/) agar bisa di-build.

# ---------- Stage 1: builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Stage 2: runner (non-root) ----------
FROM nginxinc/nginx-unprivileged:stable-alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
