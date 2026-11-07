import {
  type Address,
  createPublicClient,
  keccak256,
  stringToHex,
  zeroAddress,
} from "viem";
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
  type Snapshot = {
    paused: boolean;
    expires: number;
    pending?: Promise<boolean>;
  };
  const snapshots = new Map<string, Snapshot>();
  const snapshot = (key = "") => {
    let value = snapshots.get(key);
    if (!value) {
      value = { paused: true, expires: 0 };
      snapshots.set(key, value);
    }
    return value;
  };
  const refresh = (nightKey?: string): Promise<boolean> => {
    const state = snapshot(nightKey);
    if (state.pending) return state.pending;
    if (Date.now() < state.expires) return Promise.resolve(state.paused);
    state.pending = (async () => {
      try {
        if ((await client.getChainId()) !== deployment.chainId)
          throw new Error("Arc RPC chainId does not match deployment.");
        let token = deployment.NightToken;
        if (nightKey) {
          token = (await client.readContract({
            address: deployment.NightFactory,
            abi: deployment.abis.NightFactory ?? [],
            functionName: "tokenOf",
            args: [keccak256(stringToHex(nightKey))],
          })) as Address;
          if (token === zeroAddress)
            throw new Error("Night token unavailable.");
        }
        const results = await Promise.all(
          (["NightHook", "NightToken"] as const)
            .filter((name) => name !== "NightToken" || token !== zeroAddress)
            .map((name) =>
              client.readContract({
                address: name === "NightToken" ? token : deployment.NightHook,
                abi: deployment.abis[name] ?? [],
                functionName: "paused",
              }),
            ),
        );
        if (results.some((result) => typeof result !== "boolean"))
          throw new Error("Invalid chain pause response.");
        state.paused = results.some(Boolean);
        state.expires = Date.now() + ttlMs;
        return state.paused;
      } catch (error) {
        state.paused = true;
        state.expires = Date.now() + ttlMs;
        throw error;
      } finally {
        state.pending = undefined;
      }
    })();
    return state.pending;
  };
  return {
    refresh,
    readPaused: refresh,
    isPaused(nightKey?: string) {
      const state = snapshot(nightKey);
      if (Date.now() >= state.expires) {
        void refresh(nightKey).catch(() => {});
        return true;
      }
      return state.paused;
    },
  };
}
