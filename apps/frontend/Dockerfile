FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Rewrites /api → gateway (Docker network hostname)
ARG API_PROXY_TARGET=http://gateway:3000
ENV API_PROXY_TARGET=$API_PROXY_TARGET
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Browser-reachable gateway URL for direct multipart uploads (see src/lib/api.ts).
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so it must be an
# ARG here: setting it only at runtime has no effect on the browser code.
ARG NEXT_PUBLIC_GATEWAY_URL=
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next standalone uses process.env.HOSTNAME for server.listen(). Docker sets HOSTNAME to the
# container id/hostname by default, which breaks external access, must bind all interfaces.
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && apk add --no-cache wget
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Standalone image optimization writes under .next/cache, must be writable by non-root user
RUN mkdir -p /app/.next/cache && chown -R appuser:appgroup /app
USER appuser
EXPOSE 3001
CMD ["node", "server.js"]
