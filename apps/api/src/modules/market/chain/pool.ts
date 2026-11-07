import { lateFee, toMicros } from "@night-shares/market-model";
import { BookSource } from "@night-shares/proto/market/v1/book_pb";
import {
  type Address,
  encodeAbiParameters,
  encodePacked,
  type Hex,
  keccak256,
  parseAbi,
  toHex,
} from "viem";
import type { Ports } from "../../../container/ports";
import type { ArcDeployment } from "../../../ports/arc-deployment/arc-deployment";
import type { ForkClient } from "../../../ports/arc-deployment/validate";
import type { NightConfig } from "../../../ports/chain-executor/chain-executor";
import type { BlockStamp } from "../../../ports/chain-reader/chain-reader";
import { chainMarket, nightHash } from "./runtime";

const cache = new WeakMap<
  Ports,
  Map<string, { hash: Hex; value: Promise<Pool> }>
>();
// Square-root prices are expressed in USD per room, liquidity in the matching
// human units. This is a display estimate; executable quotes still use the router
// and its integer rounding. Position storage follows v4 StateLibrary (slot 6).
type Range = { lo: number; hi: number; liquidity: number };
type Level = {
  price: { micros: bigint };
  net?: { micros: bigint };
  size: { tenths: number };
  source: BookSource;
};
export type Pool = Awaited<ReturnType<typeof readPoolAt>>;
export const multicallAddress =
  "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** Read the deployed v4 slot0 and vault positions at one block, never mutate RPC state. */
export async function chainPool(ports: Ports, key: string) {
  const { reader } = chainMarket(ports);
  const block = await reader.head();
  const entries = cache.get(ports) ?? new Map();
  cache.set(ports, entries);
  const cacheKey = `${reader.fingerprint}:${key}`;
  const old = entries.get(cacheKey);
  if (old?.hash === block.hash) return old.value;
  const value = readPool(ports, key, block);
  entries.set(cacheKey, { hash: block.hash, value });
  try {
    return await value;
  } catch (error) {
    entries.delete(cacheKey);
    throw error;
  }
}

export function ladderQuote(
  ranges: Range[],
  spot: number,
  quantity: number,
  buy: boolean,
) {
  let remaining = quantity,
    total = 0,
    sqrt = spot;
  for (const r of buy ? ranges : [...ranges].reverse()) {
    if (r.liquidity <= 0 || (buy ? sqrt >= r.hi : sqrt <= r.lo)) continue;
    sqrt = Math.max(r.lo, Math.min(r.hi, sqrt));
    const end = buy ? r.hi : r.lo;
    const available = Math.abs(1 / sqrt - 1 / end) * r.liquidity;
    const take = Math.min(remaining, available);
    const next = 1 / (1 / sqrt + (buy ? -take : take) / r.liquidity);
    total += Math.abs(next - sqrt) * r.liquidity;
    remaining -= take;
    sqrt = next;
    if (remaining < 1e-8) return total;
  }
  return undefined;
}

async function readPool(ports: Ports, key: string, block: BlockStamp) {
  const { reader, client, deployment } = chainMarket(ports);
  const night = nightHash(key);
  const token = await reader.tokenOf(night, block.number);
  return readPoolAt(deployment, client, night, token, block);
}

export async function readPoolAt(
  d: ArcDeployment,
  client: ForkClient,
  night: Hex,
  token: Address,
  block: BlockStamp,
) {
  const calls = [
    {
      address: d.NightFactory,
      abi: d.abis.NightFactory ?? [],
      functionName: "config",
      args: [night],
    },
    { address: token, abi: d.abis.NightToken ?? [], functionName: "held" },
    { address: token, abi: d.abis.NightToken ?? [], functionName: "burned" },
    {
      address: d.NightFactory,
      abi: d.abis.NightFactory ?? [],
      functionName: "ladderComplete",
      args: [night],
    },
    {
      address: d.NightVault,
      abi: d.abis.NightVault ?? [],
      functionName: "closed",
      args: [night],
    },
    {
      address: d.NightHook,
      abi: d.abis.NightHook ?? [],
      functionName: "paused",
    },
    {
      address: d.Settlement,
      abi: d.abis.Settlement ?? [],
      functionName: "refundPerNight",
      args: [night],
    },
  ];
  const values = await client.multicall({
    contracts: calls,
    allowFailure: false,
    multicallAddress,
    blockNumber: block.number,
    batchSize: 0,
  });
  const [config, held, burned, complete, closed, paused, refundPerNight] =
    values as [NightConfig, bigint, bigint, boolean, boolean, boolean, bigint];
  const poolId = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [token, d.USDC, 0, 1, d.NightHook],
    ),
  );
  const slot = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }],
      [poolId, 6n],
    ),
  );
  const storageCall = (at: Hex) => ({
    address: d.POOL_MANAGER,
    abi: parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]),
    functionName: "extsload" as const,
    args: [at] as const,
  });
  const F = Number(config.F) / 1e6,
    k = Number(config.k) / 1e18,
    S = Number(config.S) / 1e18;
  const boundary = (i: number) =>
    Math.floor((Math.log(F * 1e-12) + (k * i) / S) / Math.log(1.0001));
  if (!Number.isInteger(S) || S < 1 || S > 100)
    throw new Error("Invalid pool supply.");
  const positions = Array.from({ length: S }, (_, i) => {
    const lo = boundary(i),
      hi = boundary(i + 1);
    const position = keccak256(
      encodePacked(
        ["address", "int24", "int24", "bytes32"],
        [d.NightVault, lo, hi, toHex(i, { size: 32 })],
      ),
    );
    const at = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }],
        [position, BigInt(slot) + 6n],
      ),
    );
    return { lo, hi, at };
  });
  const storage = await client.multicall({
    contracts: [storageCall(slot), ...positions.map((p) => storageCall(p.at))],
    allowFailure: false,
    multicallAddress,
    blockNumber: block.number,
    batchSize: 0,
  });
  const sqrt =
    (Number(BigInt(storage[0] as Hex) & ((1n << 160n) - 1n)) / 2 ** 96) * 1e6;
  const ranges = positions.map((p, i) => ({
    lo: 1.0001 ** (p.lo / 2) * 1e6,
    hi: 1.0001 ** (p.hi / 2) * 1e6,
    liquidity:
      Number(BigInt(storage[i + 1] as Hex) & ((1n << 128n) - 1n)) / 1e12,
  }));
  const asks: Level[] = [],
    bids: Level[] = [];
  const fee = lateFee(Number(config.cutoff - block.timestamp) / 3600);
  if (complete && !closed && !paused && config.cutoff > block.timestamp) {
    for (const buy of [true, false]) {
      let previous = 0;
      for (
        let tenth = 1;
        tenth <= (buy ? S * 10 : Number(held / 100000000000000000n));
        tenth++
      ) {
        const total = ladderQuote(ranges, sqrt, tenth / 10, buy);
        if (total === undefined) break;
        const micros = toMicros((total - previous) * 10);
        (buy ? asks : bids).push({
          price: { micros },
          net: buy
            ? undefined
            : { micros: toMicros((total - previous) * 10 * (1 - fee)) },
          size: { tenths: 1 },
          source: buy ? BookSource.POOL : BookSource.SELL_BACK,
        });
        previous = total;
      }
    }
  }
  const reserve =
    held > 0n
      ? ladderQuote(ranges, sqrt, Number(held) / 1e18, false)
      : undefined;
  const refund = closed
    ? refundPerNight
    : reserve === undefined
      ? undefined
      : toMicros((reserve * 0.7) / (Number(held) / 1e18));
  return {
    config,
    block,
    asks,
    bids,
    spot: toMicros(sqrt * sqrt),
    refund,
    held,
    burned,
    paused,
  };
}
