# ElderShield – Production Docker image
# Base: Chainguard hardened Node (no shell, no package manager, minimal attack surface)
# https://images.chainguard.dev/directory/image/node/overview
FROM cgr.dev/chainguard/node:latest AS builder

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM cgr.dev/chainguard/node:latest

WORKDIR /app

# Copy only compiled output and production deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Chainguard node runs as non-root by default
EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
