FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./

RUN npm install --frozen-lockfile --legacy-peer-deps
COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/branding    ./branding

USER appuser

CMD ["node", "dist/main"]
