# ─────────────────────────────────────────────────────────────────
# Next.js Full-Stack App — Multi-stage Docker Build
# ─────────────────────────────────────────────────────────────────

# ─── Build Stage ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Generate Prisma client
COPY prisma ./prisma/
RUN npx prisma generate

# Build Next.js (standalone output configured in next.config.ts)
COPY . .
RUN npm run build

# ─── Production Stage ───────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy standalone output (build script copies static/ & public/ into it)
COPY --from=builder /app/.next/standalone ./

# Ensure Prisma client & engine are available at runtime
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=builder /app/prisma               ./prisma

EXPOSE 3000

CMD ["node", "server.js"]
