import { isIP } from "node:net";

export function clientIp(
  remoteAddress: string | undefined,
  forwarded: string | string[] | undefined,
  trustProxy: boolean,
) {
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(",")[0]
    ?.trim();
  return trustProxy && first && isIP(first)
    ? first
    : (remoteAddress ?? "unknown");
}
