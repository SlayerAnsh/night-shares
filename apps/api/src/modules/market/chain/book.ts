import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { BookSource } from "@night-shares/proto/market/v1/book_pb";
import { type Address, zeroAddress } from "viem";
import { deserialize } from "../../../ports/chain-executor/chain-executor";
import type { Deps } from "../use-cases/context";
import { liveAsks } from "./asks";
import { openedNight, projectedPool } from "./nights";
import { chainMarket, nightHash } from "./runtime";
export async function chainBook(deps: Deps, key: string) {
  await openedNight(deps.ports, key);
  const { reader, deployment: d } = chainMarket(deps.ports);
  const pool = projectedPool(deps.ports, key);
  if (!pool) throw new Error("Missing projected market snapshot.");
  const { config } = pool;
  const token = deps.ports.db
    .query<{ token: Address }, [string, string]>(
      "SELECT token FROM chain_nights WHERE fingerprint = ? AND night = ?",
    )
    .get(reader.fingerprint, nightHash(key))?.token;
  const balances = new Map<Address, bigint>();
  const excluded = new Set(
    [
      zeroAddress,
      d.NightVault,
      d.POOL_MANAGER,
      d.TradeRouter,
      d.BookingRouter,
      d.Settlement,
      d.X402Settler,
    ]
      .filter(Boolean)
      .map((a) => a?.toLowerCase()),
  );
  if (token && pool.held > 0n)
    for (const row of deps.ports.db
      .query<{ args: string }, [string, string]>(
        "SELECT args FROM chain_events WHERE fingerprint = ? AND lower(address) = lower(?) AND event = 'Transfer' ORDER BY block_number, log_index",
      )
      .all(reader.fingerprint, token)) {
      const { from, to, amount, value } = deserialize<{
        from: Address;
        to: Address;
        amount?: bigint;
        value?: bigint;
      }>(row.args);
      const quantity = amount ?? value ?? 0n;
      for (const [address, delta] of [
        [from, -quantity],
        [to, quantity],
      ] as const) {
        const normalized = address.toLowerCase() as Address;
        if (!excluded.has(normalized))
          balances.set(normalized, (balances.get(normalized) ?? 0n) + delta);
      }
    }
  const holders = [...balances]
    .filter(([, balance]) => balance > 0n)
    .sort((a, b) =>
      a[1] === b[1] ? a[0].localeCompare(b[0]) : a[1] > b[1] ? -1 : 1,
    )
    .map(([wallet, balance]) => ({
      walletAddress: wallet,
      size: { tenths: Number(balance / 100000000000000000n) },
      isHost: wallet === config.host.toLowerCase(),
    }));
  const asks = (await liveAsks(deps, key)).slice(0, 50);
  return {
    tradingPaused: pool.paused,
    holders,
    asks: [
      ...pool.asks,
      ...asks.map((a) => ({
        price: { micros: a.order.price },
        size: { tenths: Number(a.qty / 100000000000000000n) },
        source: BookSource.TRADER,
        askId: `${key}|${a.order.maker}`,
      })),
    ].sort((a, b) => Number(a.price.micros - b.price.micros)),
    bids: pool.bids,
    releaseAt: timestampFromMs(Number(config.cutoff) * 1000),
  };
}
