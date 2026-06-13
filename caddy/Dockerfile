FROM node:22-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
ARG VITE_GIPHY_API_KEY
ENV VITE_GIPHY_API_KEY=$VITE_GIPHY_API_KEY
ARG VITE_GOOGLE_MAPS_API_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

FROM caddy:2-alpine
COPY --from=frontend-builder /build/dist /srv
COPY caddy/Caddyfile /etc/caddy/Caddyfile
