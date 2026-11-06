import {
  createPublicClient,
  defineChain,
  erc20Abi,
  http,
  isAddress,
} from "viem";
import { ARC_NETWORKS } from "../../config/arc-networks";

export function createOnchainUsdcBalance(
  network: keyof typeof ARC_NETWORKS,
  rpcUrl?: string,
  options: {
    fetchFn?: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>;
    wait?: (ms: number) => Promise<void>;
  } = {},
) {
  const config = ARC_NETWORKS[network];
  const client = createPublicClient({
    chain: defineChain({
      id: config.chainId,
      name: `Arc ${network}`,
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl ?? config.rpcUrl] } },
    }),
    transport: http(rpcUrl ?? config.rpcUrl, {
      timeout: 3000,
      retryCount: 0,
      fetchFn: options.fetchFn,
      retryDelay: 250,
    }),
  });
  return async function onchainUsdcBalance(
    address: string,
  ): Promise<bigint | null> {
    if (!isAddress(address)) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await client.readContract({
          address: config.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        });
      } catch (error) {
        if (!isRateLimited(error) || attempt === 2) return null;
        await (
          options.wait ??
          ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
        )(250 * 2 ** attempt);
      }
    }
    return null;
  };
}
function isRateLimited(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === -32014) return true;
  return "cause" in error && isRateLimited(error.cause);
}
