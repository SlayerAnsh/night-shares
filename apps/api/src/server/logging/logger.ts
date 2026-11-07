import type { ServerConfig } from "../../config/server-config";
import { redactRpc } from "../../shared/redact-url";

type Level = Exclude<ServerConfig["logLevel"], "silent">;
const priority = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
export type Logger = ReturnType<typeof createLogger>;

export function createLogger(
  level: ServerConfig["logLevel"] = "info",
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
) {
  return {
    log(
      levelToWrite: Level,
      event: string,
      fields: Record<string, unknown> = {},
    ) {
      if (priority[levelToWrite] < priority[level]) return;
      write(
        JSON.stringify(redactRpc({ ...fields, level: levelToWrite, event })),
      );
    },
    unexpected(error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.log("error", "unexpected_error", { message, stack });
    },
  };
}
