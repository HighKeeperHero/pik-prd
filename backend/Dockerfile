# ============================================================
# PIK — Persistent Identity Kernel
# Multi-stage Docker build for Railway deployment
# ============================================================

# ── Build Stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install OpenSSL — required by Prisma on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY tsconfig.json nest-cli.json ./
RUN npm run build

# ── Production Stage ─────────────────────────────────────────
FROM node:20-alpine AS runner

# Install OpenSSL — required by Prisma migrate deploy at runtime
RUN apk add --no-cache openssl

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json .

COPY public ./public

EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
