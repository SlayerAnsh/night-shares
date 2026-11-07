const configuredUrls = new Set<string>();
const marker = "<redacted-rpc>";

/** Register endpoints before initialization so every logging sink can redact them. */
export function registerRpcUrls(urls: readonly string[]): void {
  for (const url of urls) if (url) configuredUrls.add(url);
}

export function rpcHostname(value: unknown): string {
  try {
    return new URL(String(value)).hostname;
  } catch {
    return marker;
  }
}

/** Sanitize a detached copy, including non-enumerable Error fields and causes. */
export function redactRpc<T>(value: T, urls: readonly string[] = []): T {
  const endpoints = [...configuredUrls, ...urls]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const secrets = new Set<string>();
  for (const url of endpoints) {
    try {
      const parsed = new URL(url);
      for (const part of [
        ...parsed.pathname.split("/"),
        ...parsed.searchParams.values(),
      ]) {
        if (part.length > 12) {
          secrets.add(part);
          secrets.add(encodeURIComponent(part));
          try {
            secrets.add(decodeURIComponent(part));
          } catch {
            // A malformed escape is still redacted in its original form.
          }
        }
      }
    } catch {
      // Invalid endpoints may appear in startup errors too.
    }
  }
  const ordered = [...secrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const clean = (text: string) => {
    for (const endpoint of endpoints) text = text.split(endpoint).join(marker);
    text = text.replace(/https?:\/\/[^\s<>"'`\\]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}/<redacted>`;
      } catch {
        return marker;
      }
    });
    for (const secret of ordered) text = text.split(secret).join(marker);
    return text;
  };
  const seen = new WeakMap<object, unknown>();
  const visit = (input: unknown, key?: string): unknown => {
    if (key === "arcRpcUrl") return rpcHostname(input);
    if (key === "arcRpcUrls" && Array.isArray(input))
      return input.map(rpcHostname);
    if (typeof input === "string") return clean(input);
    if (!input || typeof input !== "object") return input;
    if (seen.has(input)) return "[Circular]";
    if (input instanceof Headers) {
      const headers = new Headers();
      input.forEach((value, name) => {
        headers.append(name, clean(value));
      });
      return headers;
    }
    if (input instanceof Uint8Array) return input.slice();
    if (input instanceof URL) return clean(input.href);
    const output: Record<string, unknown> | unknown[] = Array.isArray(input)
      ? []
      : input instanceof Error
        ? Object.create(Object.getPrototypeOf(input))
        : {};
    seen.set(input, output);
    for (const name of Object.getOwnPropertyNames(input)) {
      if (name === "length" && Array.isArray(input)) continue;
      const field = Reflect.get(input, name);
      if (typeof field === "function") continue;
      Object.defineProperty(output, clean(name), {
        value: visit(field, name),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return output;
  };
  return visit(value) as T;
}

/** JSON replacer for config dumps; retain hosts without endpoint credentials. */
export function rpcJsonReplacer(key: string, value: unknown): unknown {
  if (key === "arcRpcUrl") return rpcHostname(value);
  if (key === "arcRpcUrls" && Array.isArray(value))
    return value.map(rpcHostname);
  if (typeof value === "bigint") return value.toString();
  return typeof value === "string" ? redactRpc(value) : value;
}
