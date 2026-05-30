FROM node:22-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_GIPHY_API_KEY
ENV VITE_GIPHY_API_KEY=$VITE_GIPHY_API_KEY
RUN npm run build

FROM caddy:2-alpine
COPY --from=frontend-builder /build/dist /srv
COPY caddy/Caddyfile /etc/caddy/Caddyfile
