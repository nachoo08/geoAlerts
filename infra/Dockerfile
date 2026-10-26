# =====================================================================
#  geoAlerts — Imagen de producción (API + frontend compilado en 1 proceso)
#  Construir desde la RAÍZ del repositorio:
#     docker build -f infra/Dockerfile -t geoalerts:1.0.0 .
# =====================================================================

# ---- Etapa 1: dependencias completas y build del frontend ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY compartido/package.json compartido/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run typecheck && npm test && npm run build \
 && npm prune --omit=dev

# ---- Etapa 2: imagen final mínima ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3001 \
    DB_PATH=/data/geoalerts.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/compartido ./compartido
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.js"]
