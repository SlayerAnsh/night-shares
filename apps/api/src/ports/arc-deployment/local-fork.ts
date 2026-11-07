export function assertLocalForkRpc(rpcUrl: string): void {
  const url = new URL(rpcUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !["127.0.0.1", "localhost", "[::1]", "chain"].includes(url.hostname)
  )
    throw new Error("Fork execution requires a local RPC endpoint.");
}
