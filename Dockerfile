FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM dependencies AS monitor
WORKDIR /app
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./
USER node
CMD ["node", "--import", "tsx", "scripts/monitor.ts"]

FROM dependencies AS migrate
WORKDIR /app
COPY drizzle ./drizzle
COPY src/db ./src/db
CMD ["npm", "run", "db:migrate"]

FROM dependencies AS worker
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng && rm -rf /var/lib/apt/lists/* && groupadd --system --gid 1001 lehub && useradd --system --uid 1001 --gid lehub lehub && mkdir -p /app/data/documents && chown -R lehub:lehub /app/data
COPY --chown=lehub:lehub src ./src
COPY --chown=lehub:lehub scripts ./scripts
COPY tsconfig.json ./
USER lehub
CMD ["npm", "run", "worker"]

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 lehub && useradd --system --uid 1001 --gid lehub lehub && mkdir -p /app/data/documents && chown -R lehub:lehub /app/data
COPY --from=builder --chown=lehub:lehub /app/.next/standalone ./
COPY --from=builder --chown=lehub:lehub /app/.next/static ./.next/static
COPY --from=builder --chown=lehub:lehub /app/public ./public
USER lehub
EXPOSE 3000
CMD ["node", "server.js"]


FROM postgres:17-bookworm AS backup
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 ca-certificates rclone && rm -rf /var/lib/apt/lists/* && groupadd --system --gid 1001 lehub && useradd --system --uid 1001 --gid lehub lehub && mkdir -p /app/data/backups && chown -R lehub:lehub /app/data
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=lehub:lehub src ./src
COPY --chown=lehub:lehub scripts ./scripts
COPY package.json tsconfig.json ./
USER lehub
ENTRYPOINT []
CMD ["node", "--import", "tsx", "scripts/server-backup.ts", "--schedule"]

FROM backup AS validation
COPY --chown=lehub:lehub drizzle ./drizzle
CMD ["node", "--import", "tsx", "scripts/validate-instance.ts"]
