# Ruang Pulih — full-stack (static frontend + Express API + WebSocket)
# Dipakai untuk deploy ke Railway / Render / Fly.io / VPS Node.

FROM node:20-bookworm-slim

# Direktori kerja
WORKDIR /app

# Install dependency backend dulu (layer cache)
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

# Salin source
COPY . .

# Env default (override saat deploy via dashboard hosting)
ENV PORT=3000
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Server produksi: serve frontend statis + API + WebSocket dalam satu proses
CMD ["node", "backend/src/server.js"]
