import {
  type Address,
  createPublicClient,
  type Hex,
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
        const results = [
          await client.readContract({
            address: deployment.NightHook,
            abi: deployment.abis.NightHook ?? [],
            functionName: "paused",
          }),
        ];
        if (nightKey) {
          const night = /^0x[0-9a-fA-F]{64}$/.test(nightKey)
            ? (nightKey as Hex)
            : keccak256(stringToHex(nightKey));
          const token = (await client.readContract({
            address: deployment.NightFactory,
            abi: deployment.abis.NightFactory ?? [],
            functionName: "tokenOf",
            args: [night],
          })) as Address;
          if (!token || token === zeroAddress)
            throw new Error("Unknown night.");
          results.push(
            await client.readContract({
              address: token,
              abi: deployment.abis.NightToken ?? [],
              functionName: "paused",
            }),
          );
        }
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
  const ready = refresh();
  void ready.catch(() => {});
  return {
    ready,
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
