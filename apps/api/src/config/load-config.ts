import { parseDate } from "../shared/dates";
export type Config = { port: number; adapters: "mock"; today?: string };
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("PORT must be an integer from 0 to 65535.");
  if (env.ADAPTERS !== undefined && env.ADAPTERS !== "mock")
    throw new Error("ADAPTERS must be mock.");
  if (env.TODAY !== undefined) parseDate(env.TODAY);
  return { port, adapters: "mock", today: env.TODAY };
}
