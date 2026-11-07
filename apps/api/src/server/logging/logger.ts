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
      const raw = error instanceof Error ? error.message : String(error);
      // Keep stack frame locations only; the first stack line repeats the
      // unscrubbed message.
      const frames =
        error instanceof Error
          ? error.stack
              ?.split("\n")
              .filter((line) => line.trimStart().startsWith("at "))
              .join("\n")
          : undefined;
      this.log("error", "unexpected_error", {
        name: error instanceof Error ? error.name : typeof error,
        message: scrubMessage(raw),
        stack: frames,
      });
    },
  };
}

// Error text can quote request bodies, signatures, tokens or identity
// nullifiers. Mask long secret-like runs and cap the length so the log keeps
// the diagnostic shape without the values.
export function scrubMessage(message: string): string {
  return message
    .replace(/0x[0-9a-fA-F]{64,}/g, "0x<redacted>")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "<redacted-jwt>")
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, "<redacted>")
    .slice(0, 300);
}
