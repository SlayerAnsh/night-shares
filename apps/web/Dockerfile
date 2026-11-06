FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.20.0
COPY . .
RUN pnpm install --frozen-lockfile --filter @night-shares/web...
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @night-shares/web build

FROM node:22.14.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 API_URL=http://api:8787
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
