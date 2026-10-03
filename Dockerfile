FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM dependencies AS migrate
WORKDIR /app
COPY drizzle ./drizzle
COPY src/db ./src/db
CMD ["npm", "run", "db:migrate"]

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
