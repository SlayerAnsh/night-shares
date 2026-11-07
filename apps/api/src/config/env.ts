export function normalizeEnv(env: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [
      key,
      value?.trim() || undefined,
    ]),
  );
}

export function envValue(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}
