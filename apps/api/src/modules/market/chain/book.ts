import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { BookSource } from "@night-shares/proto/market/v1/book_pb";
import { type Address, zeroAddress } from "viem";
import type { NightConfig } from "../../../ports/chain-executor/chain-executor";
import type { Deps } from "../use-cases/context";
import { liveAsks } from "./asks";
import { openedNight } from "./nights";
import { chainMarket, nightHash } from "./runtime";
export async function chainBook(deps: Deps, key: string) {
  await openedNight(deps.ports, key);
  const { reader } = chainMarket(deps.ports);
  const night = nightHash(key),
    head = await reader.head();
  const read = async <T>(
    contract: string,
    functionName: string,
    args: readonly unknown[] = [],
  ) =>
    (await reader.read<T>({ contract, night, functionName, args }, head.number))
      .value;
  const config = await read<NightConfig>("NightFactory", "config", [night]);
  const holders = [];
  let wallet = await read<Address>("NightToken", "head");
  const seen = new Set<string>();
  while (wallet !== zeroAddress) {
    if (seen.has(wallet.toLowerCase()) || seen.size >= 1000)
      throw new Error("Invalid chain holder list.");
    seen.add(wallet.toLowerCase());
    const size = await read<bigint>("NightToken", "balanceOf", [wallet]);
    holders.push({
      walletAddress: wallet,
      size: { tenths: Number(size / 100000000000000000n) },
      isHost: wallet.toLowerCase() === config.host.toLowerCase(),
    });
    wallet = await read<Address>("NightToken", "next", [wallet]);
  }
  const asks = await liveAsks(deps, key);
  return {
    tradingPaused: await read<boolean>("NightHook", "paused"),
    holders,
    asks: asks.map((a) => ({
      price: { micros: a.order.price },
      size: { tenths: Number(a.qty / 100000000000000000n) },
      source: BookSource.TRADER,
      askId: `${key}|${a.order.maker}`,
    })),
    // Finite pool prices are available through actual-sender router simulation only.
    bids: [],
    releaseAt: timestampFromMs(Number(config.cutoff) * 1000),
  };
}
