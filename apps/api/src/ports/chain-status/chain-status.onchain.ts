import { createPublicClient, zeroAddress } from "viem";
import type { ArcDeployment } from "../arc-deployment/arc-deployment";
import { arcTransport } from "../arc-deployment/transport";

/** Synchronous guards consume a fail-closed snapshot; RPC never runs in SQLite transactions. */
export function createOnchainChainStatus(
  deployment: ArcDeployment,
  rpcUrl: string,
  ttlMs = 5000,
  fetchFn?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  rpcUrls?: string[],
) {
  const client = createPublicClient({
    transport: arcTransport(rpcUrls ?? [rpcUrl], {
      fetchFn: fetchFn as typeof fetch,
      retries: fetchFn ? 0 : 4,
    }),
  });
  for (const name of ["NightHook", "NightToken"] as const) {
    const matches = deployment.abis[name]?.filter(
      (item) =>
        item.type === "function" &&
        item.name === "paused" &&
        item.stateMutability === "view" &&
        item.inputs.length === 0 &&
        item.outputs.length === 1 &&
        item.outputs[0]?.type === "bool",
    );
    if (matches?.length !== 1)
      throw new Error(
        `Arc deployment abis.${name} must contain unambiguous paused() view returns (bool).`,
      );
  }
  let paused = true;
  let expires = 0;
  let pending: Promise<boolean> | undefined;
  const refresh = (): Promise<boolean> => {
    if (pending) return pending;
    if (Date.now() < expires) return Promise.resolve(paused);
    pending = (async () => {
      try {
        if ((await client.getChainId()) !== deployment.chainId)
          throw new Error("Arc RPC chainId does not match deployment.");
        const results = await Promise.all(
          (["NightHook", "NightToken"] as const)
            .filter((name) => deployment[name] !== zeroAddress)
            .map((name) =>
              client.readContract({
                address: deployment[name],
                abi: deployment.abis[name] ?? [],
                functionName: "paused",
              }),
            ),
        );
        if (results.some((result) => typeof result !== "boolean"))
          throw new Error("Invalid chain pause response.");
        paused = results.some(Boolean);
        expires = Date.now() + ttlMs;
        return paused;
      } catch (error) {
        paused = true;
        expires = Date.now() + ttlMs;
        throw error;
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  };
  // Refresh lazily to avoid background timers surviving container shutdown.
  return {
    refresh,
    async readPaused() {
      return refresh();
    },
    isPaused(_nightKey?: string) {
      if (Date.now() >= expires) {
        void refresh().catch(() => {});
        return true;
      }
      return paused;
    },
  };
}
