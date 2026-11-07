import { create } from "@bufbuild/protobuf";
import {
  type Timestamp,
  timestampFromMs,
  timestampMs,
} from "@bufbuild/protobuf/wkt";
import { AskSchema } from "@night-shares/proto/market/v1/book_pb";
import { type Address, type Hex, hashTypedData, verifyTypedData } from "viem";
import {
  type Ask,
  deserialize,
  type NightConfig,
  serialize,
  tokenTenths,
} from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import { DomainError } from "../../../shared/errors/domain-error";
import { toProto } from "../../../shared/night-key";
import { type Deps, quantity } from "../use-cases/context";
import {
  assertOrb,
  chainMarket,
  confirmed,
  minBigInt,
  nightHash,
  userWallet,
} from "./runtime";

export type AskRow = {
  fingerprint: string;
  night_key: string;
  maker: Address;
  human_id: string;
  wallet_id: string;
  digest: Hex;
  payload: string;
  status: string;
};
const types = {
  Order: [
    { name: "night", type: "bytes32" },
    { name: "size", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "maker", type: "address" },
  ],
} as const;
function typed(deps: Deps, order: Ask["order"]) {
  const d = chainMarket(deps.ports).deployment;
  return {
    domain: {
      name: "NightShares",
      version: "1",
      chainId: d.chainId,
      verifyingContract: d.TradeRouter,
    },
    types,
    primaryType: "Order" as const,
    message: order,
  };
}
export function askRows(deps: Deps, key?: string) {
  const { reader } = chainMarket(deps.ports);
  return deps.ports.db
    .query<AskRow, [string]>(
      "SELECT * FROM market_chain_asks WHERE fingerprint = ? AND status = 'open'",
    )
    .all(reader.fingerprint)
    .filter((r) => key === undefined || r.night_key === key);
}
export async function liveAsks(deps: Deps, key: string): Promise<Ask[]> {
  const { reader } = chainMarket(deps.ports);
  const head = await reader.head();
  const asks: Ask[] = [];
  for (const row of askRows(deps, key)) {
    const a = deserialize<Ask>(row.payload);
    const nonce = (
      await reader.read<bigint>(
        { contract: "TradeRouter", functionName: "nonces", args: [row.maker] },
        head.number,
      )
    ).value;
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
          night: a.order.night,
          functionName: "balanceOf",
          args: [row.maker],
        },
        head.number,
      )
    ).value;
    if (
      nonce !== a.order.nonce ||
      head.timestamp >= a.order.expiry ||
      filled >= a.order.size
    )
      continue;
    const remaining = a.order.size - filled;
    a.qty =
      (minBigInt(remaining, balance) / 100000000000000000n) *
      100000000000000000n;
    if (a.qty > 0n) asks.push(a);
  }
  return asks.sort((a, b) =>
    a.order.price < b.order.price ? -1 : a.order.price > b.order.price ? 1 : 0,
  );
}
export async function prepareChainAsk(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  price: bigint,
  expiry?: Timestamp,
  nonce?: bigint,
) {
  quantity({ tenths: size });
  if (price <= 0n)
    throw new DomainError("INVALID_ARGUMENT", "Ask price must be positive.");
  const { reader } = chainMarket(deps.ports);
  const wallet = await userWallet(deps.ports, user);
  await assertOrb(deps.ports, wallet.address);
  const now = (await reader.head()).timestamp;
  const expires = expiry
    ? BigInt(Math.floor(timestampMs(expiry) / 1000))
    : now + 86400n;
  if (expires <= now || expires > now + 604800n)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Ask expiry must be in the future and within seven days.",
    );
  const current = (
    await reader.read<bigint>({
      contract: "TradeRouter",
      functionName: "nonces",
      args: [wallet.address],
    })
  ).value;
  if (nonce !== undefined && nonce !== current)
    throw new DomainError("FAILED_PRECONDITION", "Ask nonce is stale.");
  const order = {
    night: nightHash(key),
    size: tokenTenths(size),
    price,
    expiry: expires,
    nonce: current,
    maker: wallet.address,
  };
  const data = typed(deps, order);
  const digest = hashTypedData(data);
  return {
    wallet,
    data,
    chainOrder: order,
    digest,
    typedDataJson: JSON.stringify(data, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
    order: create(AskSchema, {
      id: `${key}|${wallet.address}`,
      night: toProto(key),
      size: { tenths: size },
      price: { micros: price },
      expiry: timestampFromMs(Number(expires) * 1000),
      nonce: current,
      maker: wallet.address,
      digest,
    }),
  };
}
export async function postChainAsk(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  price: bigint,
  options: { expiry?: Timestamp; nonce?: bigint; signature?: string } = {},
) {
  const { reader, custody } = chainMarket(deps.ports);
  const previous = askRows(deps, key).find(
    (r) => r.maker.toLowerCase() === user.walletAddress.toLowerCase(),
  );
  if (previous) {
    if (options.signature)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Cancel the existing ask before submitting a replacement signature.",
      );
    await cancelChainAsks(deps, user, `${key}|${previous.maker}`);
  }
  const p = await prepareChainAsk(
    deps,
    user,
    key,
    size,
    price,
    options.expiry,
    options.nonce,
  );
  const balance = (
    await reader.read<bigint>({
      contract: "NightToken",
      night: p.chainOrder.night,
      functionName: "balanceOf",
      args: [p.wallet.address],
    })
  ).value;
  if (balance < p.chainOrder.size)
    throw new DomainError("FAILED_PRECONDITION", "Not enough room nights.");
  const signature =
    (options.signature as Hex | undefined) ??
    (await custody.signTypedData(p.wallet.walletId, p.data));
  if (
    !(await verifyTypedData({
      ...p.data,
      address: p.wallet.address,
      signature,
    }))
  )
    throw new DomainError("INVALID_ARGUMENT", "Invalid ask signature.");
  const pending = deps.ports.db
    .query(
      "SELECT 1 FROM market_chain_cancellations WHERE fingerprint = ? AND maker = ? AND state = 'pending'",
    )
    .get(reader.fingerprint, p.wallet.address);
  if (pending)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Ask cancellation is pending reconciliation.",
    );
  deps.ports.db
    .query("INSERT INTO market_chain_asks VALUES (?, ?, ?, ?, ?, ?, ?, 'open')")
    .run(
      reader.fingerprint,
      key,
      p.wallet.address,
      user.humanId,
      p.wallet.walletId,
      p.digest,
      serialize({ order: p.chainOrder, signature, qty: p.chainOrder.size }),
    );
  const config = (
    await reader.read<NightConfig>({
      contract: "NightFactory",
      functionName: "config",
      args: [p.chainOrder.night],
    })
  ).value;
  return {
    ask: p.order,
    isAboveTwiceFair: false,
    isAboveRecallCap: price > config.X,
  };
}
// A persisted keep-list makes cancelAll plus re-signing resumable after mining.
export async function cancelChainAsks(
  deps: Deps,
  user: User,
  target?: string,
  selected?: { walletId: string; address: Address },
): Promise<{ nonce: bigint; cancelledCount: number }> {
  const { reader, executor, custody } = chainMarket(deps.ports);
  const parent = await userWallet(deps.ports, user);
  let wallet = selected ?? parent;
  if (target) {
    const row = askRows(deps).find(
      (r) =>
        `${r.night_key}|${r.maker}` === target && r.human_id === user.humanId,
    );
    if (!row) throw new DomainError("NOT_FOUND", "Ask not found.");
    const resolved = await custody.resolveWallet?.(row.wallet_id);
    if (!resolved || resolved.address.toLowerCase() !== row.maker.toLowerCase())
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Ask custody is unavailable.",
      );
    wallet = resolved;
  }
  if (!target && !selected) {
    const makers = new Map(
      askRows(deps)
        .filter((r) => r.human_id === user.humanId)
        .map((r) => [r.wallet_id, { walletId: r.wallet_id, address: r.maker }]),
    );
    makers.set(parent.walletId, parent);
    const agent = await custody.getWallet({
      kind: "system",
      name: `market-agent:${user.humanId}`,
    });
    if (agent) makers.set(agent.walletId, agent);
    let cancelledCount = 0,
      nonce = 0n;
    for (const maker of makers.values()) {
      const result = await cancelChainAsks(deps, user, undefined, maker);
      cancelledCount += result.cancelledCount;
      if (maker.walletId === parent.walletId) nonce = result.nonce;
    }
    return { nonce, cancelledCount };
  }
  if (
    target &&
    !askRows(deps).some(
      (r) =>
        `${r.night_key}|${r.maker}` === target &&
        r.maker.toLowerCase() === wallet.address.toLowerCase(),
    )
  )
    throw new DomainError("NOT_FOUND", "Ask not found.");
  type Cancellation = { id: string; target: string | null; keep: string };
  let pending = deps.ports.db
    .query<Cancellation, [string, string]>(
      "SELECT * FROM market_chain_cancellations WHERE fingerprint = ? AND maker = ? AND state = 'pending'",
    )
    .get(reader.fingerprint, wallet.address);
  if (pending && pending.target !== (target ?? null))
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Another cancellation is pending.",
    );
  if (!pending) {
    pending = {
      id: deps.ports.ids.next("cancel"),
      target: target ?? null,
      keep: serialize(
        askRows(deps).filter(
          (r) =>
            r.maker.toLowerCase() === wallet.address.toLowerCase() &&
            target &&
            `${r.night_key}|${r.maker}` !== target,
        ),
      ),
    };
    deps.ports.db
      .query(
        "INSERT INTO market_chain_cancellations VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')",
      )
      .run(
        pending.id,
        reader.fingerprint,
        wallet.address,
        wallet.walletId,
        pending.target,
        pending.keep,
        serialize(user),
      );
  }
  confirmed(
    await executor.execute({
      operationId: pending.id,
      walletId: wallet.walletId,
      command: { kind: "cancelAll" },
    }),
  );
  const nonce = (
    await reader.read<bigint>({
      contract: "TradeRouter",
      functionName: "nonces",
      args: [wallet.address],
    })
  ).value;
  const now = (await reader.head()).timestamp;
  const replacements: { row: AskRow; ask: Ask; digest: Hex }[] = [];
  for (const row of deserialize<AskRow[]>(pending.keep)) {
    const ask = deserialize<Ask>(row.payload);
    const filled = (
      await reader.read<bigint>({
        contract: "TradeRouter",
        functionName: "filled",
        args: [row.digest],
      })
    ).value;
    const balance = (
      await reader.read<bigint>({
        contract: "NightToken",
        night: ask.order.night,
        functionName: "balanceOf",
        args: [wallet.address],
      })
    ).value;
    const remaining = ask.order.size - filled;
    const size =
      (minBigInt(remaining, balance) / 100000000000000000n) *
      100000000000000000n;
    if (size <= 0n || ask.order.expiry <= now) continue;
    ask.order = { ...ask.order, nonce, size };
    ask.qty = size;
    const data = typed(deps, ask.order);
    ask.signature = await custody.signTypedData(wallet.walletId, data);
    replacements.push({ row, ask, digest: hashTypedData(data) });
  }
  const cancelledCount = deps.ports.db.transaction(() => {
    const count = deps.ports.db
      .query(
        "UPDATE market_chain_asks SET status = 'cancelled' WHERE fingerprint = ? AND maker = ? AND status = 'open'",
      )
      .run(reader.fingerprint, wallet.address).changes;
    for (const { row, ask, digest } of replacements)
      deps.ports.db
        .query(
          "INSERT INTO market_chain_asks VALUES (?, ?, ?, ?, ?, ?, ?, 'open')",
        )
        .run(
          reader.fingerprint,
          row.night_key,
          wallet.address,
          user.humanId,
          wallet.walletId,
          digest,
          serialize(ask),
        );
    deps.ports.db
      .query(
        "UPDATE market_chain_cancellations SET state = 'finalized' WHERE id = ?",
      )
      .run(pending.id);
    return count - replacements.length;
  })();
  return { nonce, cancelledCount };
}
