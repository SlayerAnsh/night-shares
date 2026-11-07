import {
  createTransport,
  type EIP1193RequestFn,
  http,
  type Transport,
} from "viem";
import { redactRpc, registerRpcUrls } from "../../shared/redact-url";

export function retryableRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    status?: number;
    code?: number;
    message?: string;
    cause?: unknown;
  };
  return (
    /request exceeds defined limit/i.test(e.message ?? "") ||
    e.status === 429 ||
    (e.status !== undefined && e.status >= 500 && e.status < 600) ||
    e.code === -32014 ||
    e.code === -32005 ||
    retryableRpcError(e.cause)
  );
}

/** Retry transient Arc failures with exponential backoff and endpoint rotation. */
export function arcTransport(
  urls: readonly string[],
  options: {
    fetchFn?: typeof fetch;
    wait?: (ms: number) => Promise<void>;
    retries?: number;
  } = {},
): Transport {
  registerRpcUrls(urls);
  if (!urls.length) throw new Error("At least one Arc RPC URL is required.");
  return (config) => {
    const transports = urls.map((url) =>
      http(url, { retryCount: 0, timeout: 10000, fetchFn: options.fetchFn })(
        config,
      ),
    );
    let selected = 0;
    return createTransport({
      key: "arc",
      name: "Arc rotating RPC",
      type: "http",
      retryCount: 0,
      request: (async (args) => {
        for (let attempt = 0; ; attempt++) {
          try {
            const transport = transports[selected % transports.length];
            if (!transport) throw new Error("Arc RPC transport unavailable.");
            return await transport.request(args);
          } catch (error) {
            if (attempt >= (options.retries ?? 6) || !retryableRpcError(error))
              throw redactRpc(error, urls);
            selected = (selected + 1) % transports.length;
            await (
              options.wait ??
              ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
            )(250 * 2 ** attempt);
          }
        }
      }) as EIP1193RequestFn,
    });
  };
}
