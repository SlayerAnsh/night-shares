FROM node:22.14.0-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@10.20.0
COPY . .
RUN pnpm install --frozen-lockfile --filter @night-shares/api...

# Bun 1.3.5 was released on December 17, 2025.
FROM oven/bun:1.3.5 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/night-shares.db
COPY --from=dependencies --chown=bun:bun /app /app
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD bun -e 'const r = await fetch("http://127.0.0.1:" + (process.env.PORT || "8787") + "/readyz"); process.exit(r.ok ? 0 : 1)'
WORKDIR /app/apps/api
CMD ["bun", "src/main.ts"]
