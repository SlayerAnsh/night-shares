import { loadConfig } from "./config/load-config";
import { buildContainer } from "./container/build-container";
import { createJobRegistry } from "./jobs/registry";
import { createJobRunner } from "./jobs/runner";
import { createServer } from "./server/create-server";
import { createLogger } from "./server/logging/logger";
import { createShutdown, type ShutdownHook } from "./server/shutdown";

import { registerRpcUrls } from "./shared/redact-url";

registerRpcUrls(
  (process.env.ARC_RPC_URLS ?? process.env.ARC_RPC_URL ?? "")
    .split(",")
    .map((url) => url.trim()),
);
try {
  const config = loadConfig();
  registerRpcUrls(
    config.arcRpcUrls ?? (config.arcRpcUrl ? [config.arcRpcUrl] : []),
  );
  const container = buildContainer(config);
  const logger = createLogger(config.logLevel);
  const shutdownHooks: ShutdownHook[] = [];
  const jobs = createJobRunner({
    clock: container.ports.clock,
    intervalMs: config.jobIntervalMs ?? 60000,
    jobs: createJobRegistry(container.ports),
    onError: (error) => logger.unexpected(error),
  });
  if (process.env.NODE_ENV !== "test") jobs.start();
  shutdownHooks.push(() => jobs.stop());
  const server = createServer(container, config);
  server.once("error", (error) => {
    logger.unexpected(error);
    process.exitCode = 1;
    void jobs.stop().catch((error) => logger.unexpected(error));
  });
  server.listen(config.port, () => {
    const address = server.address();
    logger.log("info", "listening", {
      port: typeof address === "object" && address ? address.port : config.port,
    });
  });
  const shutdown = createShutdown({
    server,
    hooks: shutdownHooks,
    closeDatabase: () => container.ports.db.close(),
    timeoutMs: config.shutdownTimeoutMs ?? 10_000,
    logger,
    exit: (code) => process.exit(code),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown();
    });
  }
} catch (error) {
  createLogger().unexpected(error);
  process.exitCode = 1;
}
