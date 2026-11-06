export function proxyHeaders(source: Headers) {
  const headers = new Headers(source);
  const connection = headers.get("connection")?.split(",") ?? [];
  for (const name of [
    ...connection,
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "content-encoding",
    "set-cookie",
  ])
    headers.delete(name.trim());
  headers.set("cache-control", "no-store");
  return headers;
}
