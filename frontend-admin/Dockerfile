# ─────────────────────────────────────────────────────────────────
# React Admin Panel — Multi-stage Docker Build (Vite + nginx)
# ─────────────────────────────────────────────────────────────────

# ─── Build Stage ────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install

# Build-time env variable for the API base URL
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build the Vite application
COPY . .
RUN npm run build

# ─── Production Stage (nginx) ──────────────────────────────────
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (proxies /api/ → Django backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
