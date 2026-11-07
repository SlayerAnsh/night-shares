import { type Hex, keccak256, stringToHex } from "viem";
import type { Ports } from "../../../container/ports";
import {
  type Ask,
  deserialize,
} from "../../../ports/chain-executor/chain-executor";
import { chainContext } from "./context";

/** Consume Task 3's deployment-scoped signatures, never the mock order book. */
export async function bookingAsks(
  ports: Ports,
  key: string,
  timestamp: bigint,
): Promise<Ask[]> {
  const { reader } = chainContext(ports);
  if (
    !ports.db
      .query(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'market_chain_asks'",
      )
      .get()
  )
    return [];
  const night = keccak256(stringToHex(key));
  const head = await reader.head();
  const rows = ports.db
    .query<{ digest: Hex; payload: string }, [string, string]>(
      "SELECT digest, payload FROM market_chain_asks WHERE fingerprint = ? AND night_key = ? AND status = 'open'",
    )
    .all(reader.fingerprint, key);
  const asks: Ask[] = [];
  for (const row of rows) {
    const ask = deserialize<Ask>(row.payload);
    const { order } = ask;
    if (
      order.night !== night ||
      order.expiry <= timestamp ||
      order.expiry <= head.timestamp
    )
      continue;
    const nonce = (
      await reader.read<bigint>(
        {
          contract: "TradeRouter",
          functionName: "nonces",
          args: [order.maker],
        },
        head.number,
      )
    ).value;
    if (nonce !== order.nonce) continue;
    const filled = (
      await reader.read<bigint>(
        { contract: "TradeRouter", functionName: "filled", args: [row.digest] },
        head.number,
      )
    ).value;
    const balance = (
      await reader.read<bigint>(
        {
          contract: "NightToken",
          night,
          functionName: "balanceOf",
          args: [order.maker],
        },
        head.number,
      )
    ).value;
    let qty = order.size - filled;
    if (qty > balance) qty = balance;
    if (qty > 10n ** 18n) qty = 10n ** 18n;
    qty = (qty / 10n ** 17n) * 10n ** 17n;
    if (qty > 0n) asks.push({ ...ask, qty });
  }
  return asks.sort((a, b) =>
    a.order.price < b.order.price ? -1 : a.order.price > b.order.price ? 1 : 0,
  );
}
