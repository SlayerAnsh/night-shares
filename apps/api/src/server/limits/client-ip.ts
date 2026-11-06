import { isIP } from "node:net";
import { isTrustedProxy } from "./ip-address";

export function clientIp(
  remoteAddress: string | undefined,
  forwarded: string | string[] | undefined,
  trustProxy: boolean,
  trustedProxyHops = 1,
  trustedProxies: readonly string[] = [],
) {
  const fallback = remoteAddress ?? "unknown";
  if (
    !trustProxy ||
    !remoteAddress ||
    !isTrustedProxy(remoteAddress, trustedProxies) ||
    !Number.isSafeInteger(trustedProxyHops) ||
    trustedProxyHops < 1
  )
    return fallback;
  const entries = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded)
    ?.split(",")
    .map((entry) => entry.trim());
  if (
    !entries ||
    entries.length < trustedProxyHops ||
    entries.some((entry) => !isIP(entry) || entry.includes("%"))
  )
    return fallback;
  return entries[entries.length - trustedProxyHops] ?? fallback;
}
