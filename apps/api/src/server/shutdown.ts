import type { Server } from "node:http";
import type { Logger } from "./logging/logger";

export type ShutdownHook = () => void | Promise<void>;
export function createShutdown(deps: {
  server: Pick<
    Server,
    "close" | "closeIdleConnections" | "closeAllConnections"
  > & { beginShutdown(): void; drain(): Promise<void> };
  hooks: ShutdownHook[];
  closeDatabase: () => void;
  timeoutMs: number;
  logger: Logger;
  exit: (code: number) => void;
}) {
  let shutdown: Promise<void> | undefined;
  return () => {
    shutdown ??= stop();
    return shutdown;
  };
  async function stop() {
    deps.server.beginShutdown();
    deps.logger.log("info", "shutdown_started");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), deps.timeoutMs);
    });
    try {
      const closed = new Promise<void>((resolve, reject) =>
        deps.server.close((error) => (error ? reject(error) : resolve())),
      );
      deps.server.closeIdleConnections();
      const hooks = deps.hooks.map(async (hook) => hook());
      const results = await Promise.race([
        Promise.allSettled([closed, deps.server.drain(), ...hooks]),
        deadline,
      ]);
      if (results === "timeout") {
        deps.logger.log("error", "shutdown_timeout");
        deps.server.closeAllConnections();
        deps.closeDatabase();
        deps.exit(1);
        return;
      }
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
      deps.closeDatabase();
      deps.logger.log("info", "shutdown_complete");
    } catch (error) {
      deps.logger.unexpected(error);
      deps.server.closeAllConnections();
      deps.closeDatabase();
      deps.exit(1);
    } finally {
      clearTimeout(timer);
    }
  }
}
