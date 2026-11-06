import { parseDate } from "../shared/dates";
export type Config = {
  port: number;
  adapters: "mock";
  today?: string;
  dbPath?: string;
  clock?: "system" | "mock";
  ids?: "random" | "sequential";
};
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const rawPort = env.PORT ?? "8787";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port > 65535)
    throw new Error("PORT must be an integer from 0 to 65535.");
  if (env.ADAPTERS !== undefined && env.ADAPTERS !== "mock")
    throw new Error("ADAPTERS must be mock.");
  if (env.TODAY !== undefined) {
    try {
      parseDate(env.TODAY);
    } catch {
      throw new Error("TODAY must be a valid YYYY-MM-DD date.");
    }
  }
  const clock = env.CLOCK ?? "system";
  if (clock !== "system" && clock !== "mock")
    throw new Error("CLOCK must be system or mock.");
  const ids = env.IDS ?? "random";
  if (ids !== "random" && ids !== "sequential")
    throw new Error("IDS must be random or sequential.");
  const dbPath = env.DB_PATH ?? "./data/night-shares.db";
  if (!dbPath.trim() || dbPath.includes("\0"))
    throw new Error("DB_PATH must be a nonempty SQLite file path or :memory:.");
  return { port, adapters: "mock", today: env.TODAY, dbPath, clock, ids };
}
