import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  CutoffClaimSchema,
  GetPortfolioResponseSchema,
} from "@night-shares/proto/market/v1/market_pb";
import type { Address } from "viem";
import {
  deserialize,
  serialize,
} from "../../../ports/chain-executor/chain-executor";
import {
  type PositionSnapshot,
  positionSnapshot,
} from "../../../ports/chain-reader/snapshots";
import type { User } from "../../../ports/sessions/session-store";
import { fromProto, toProto } from "../../../shared/night-key";
import { agentWallets } from "../repo/agent-wallets.sqlite";
import type { Deps } from "../use-cases/context";
import { chainAccounting } from "./accounting";
import { askRows, liveAsks } from "./asks";
import { chainMarket, nightHash, userWallet } from "./runtime";

export async function ownedWallets(deps: Deps, user: User) {
  const parent = await userWallet(deps.ports, user);
  const agent = await chainMarket(deps.ports).custody.getWallet({
    kind: "system",
    name: `market-agent:${user.humanId}`,
  });
  return agent ? [parent, agent] : [parent];
}
export async function refreshPosition(
  deps: Deps,
  user: User,
  key: string,
  wallet: Address,
) {
  const { reader } = chainMarket(deps.ports);
  const position = await positionSnapshot(reader, nightHash(key), wallet);
  const cutoffBalance = (
    await reader.read<bigint>(
      {
        contract: "NightToken",
        night: nightHash(key),
        functionName: "cutoffBalanceOf",
        args: [wallet],
      },
      position.block.number,
    )
  ).value;
  const snapshot = { ...position, value: { ...position.value, cutoffBalance } };
  deps.ports.db
    .query(`INSERT INTO market_chain_positions (fingerprint,night_key,wallet,human_id,block_number,block_hash,snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(fingerprint,night_key,wallet) DO UPDATE SET block_number=excluded.block_number,block_hash=excluded.block_hash,snapshot=excluded.snapshot`)
    .run(
      reader.fingerprint,
      key,
      wallet,
      user.humanId,
      snapshot.block.number.toString(),
      snapshot.block.hash,
      serialize(snapshot.value),
    );
  return snapshot;
}
export async function chainPortfolio(deps: Deps, user: User) {
  const { reader } = chainMarket(deps.ports);
  const response = create(GetPortfolioResponseSchema);
  let claimable = 0n;
  const wallets = await ownedWallets(deps, user);
  await reader.poll(1000);
  let realised = 0n;
  let complete = true;
  // Only registered chain nights are queried; mock catalog inventory is never imported.
  for (const record of deps.ports.inventory.list()) {
    const token = (
      await reader.read<Address>({
        contract: "NightFactory",
        functionName: "tokenOf",
        args: [nightHash(record.key)],
      })
    ).value;
    if (/^0x0{40}$/i.test(token)) continue;
    let balance = 0n,
      cost = 0n;
    let known = true;
    for (const wallet of wallets) {
      const p = await refreshPosition(deps, user, record.key, wallet.address);
      balance += p.value.balance;
      claimable += p.value.claimable;
      const accounting = chainAccounting(
        deps,
        nightHash(record.key),
        token,
        wallet.address,
      );
      cost += accounting.cost;
      realised += accounting.realised;
      complete &&= accounting.complete;
      known &&= accounting.known && accounting.balance === p.value.balance;
    }
    if (balance)
      response.holdings.push({
        $typeName: "night_shares.market.v1.Holding",
        night: toProto(record.key),
        size: {
          $typeName: "night_shares.common.v1.RoomNights",
          tenths: Number(balance / 100000000000000000n),
        },
        isHost: false,
        averageCost: known
          ? {
              $typeName: "night_shares.common.v1.Usdc",
              micros: (cost * 1000000000000000000n) / balance,
            }
          : undefined,
      });
    const live = await liveAsks(deps, record.key);
    for (const row of askRows(deps, record.key).filter((r) =>
      wallets.some((w) => w.address.toLowerCase() === r.maker.toLowerCase()),
    )) {
      const ask = live.find(
        (a) =>
          a.signature ===
          deserialize<{ signature: string }>(row.payload).signature,
      );
      if (!ask) continue;
      response.listings.push({
        $typeName: "night_shares.market.v1.Ask",
        id: `${record.key}|${row.maker}`,
        night: toProto(record.key),
        maker: row.maker,
        digest: row.digest,
        nonce: ask.order.nonce,
        size: {
          $typeName: "night_shares.common.v1.RoomNights",
          tenths: Number(ask.qty / 100000000000000000n),
        },
        price: {
          $typeName: "night_shares.common.v1.Usdc",
          micros: ask.order.price,
        },
        expiry: timestampFromMs(Number(ask.order.expiry) * 1000),
      });
    }
  }
  if (complete)
    response.realisedPnl = {
      $typeName: "night_shares.common.v1.Usdc",
      micros: realised,
    };
  response.unclaimedCutoff = {
    $typeName: "night_shares.common.v1.Usdc",
    micros: claimable,
  };
  response.agentOrders = [
    ...deps.repo.account(user.humanId).orders.values(),
  ].map((o) => structuredClone(o));
  return response;
}
export async function chainClaims(deps: Deps, user: User) {
  await chainPortfolio(deps, user);
  const { reader } = chainMarket(deps.ports);
  // One entry per wallet. The protocol claims by msg.sender, never by human ID.
  const rows = deps.ports.db
    .query<
      { night_key: string; wallet: string; snapshot: string },
      [string, string]
    >(
      "SELECT * FROM market_chain_positions WHERE fingerprint = ? AND human_id = ?",
    )
    .all(reader.fingerprint, user.humanId);
  return {
    claims: rows.flatMap((r) => {
      const p = deserialize<PositionSnapshot & { cutoffBalance: bigint }>(
        r.snapshot,
      );
      return p.claimable
        ? [
            {
              ...create(CutoffClaimSchema, {
                night: toProto(r.night_key),
                amount: { micros: p.claimable },
                size: { tenths: Number(p.cutoffBalance / 100000000000000000n) },
              }),
              holderWallet: r.wallet,
            },
          ]
        : [];
    }),
  };
}
export async function chainAgentHoldings(deps: Deps, user: User) {
  const address = agentWallets(deps.ports.db).get(user).address as Address;
  const portfolio = await chainPortfolio(deps, user);
  const { reader } = chainMarket(deps.ports);
  return portfolio.holdings.flatMap((h) => {
    if (!h.night) return [];
    const key = fromProto(h.night);
    const row = deps.ports.db
      .query<{ snapshot: string }, [string, string, string]>(
        "SELECT snapshot FROM market_chain_positions WHERE fingerprint = ? AND night_key = ? AND wallet = ?",
      )
      .get(reader.fingerprint, key, address);
    const balance = row
      ? deserialize<PositionSnapshot>(row.snapshot).balance
      : 0n;
    return balance
      ? [
          {
            night: h.night,
            size: { tenths: Number(balance / 100000000000000000n) },
          },
        ]
      : [];
  });
}
