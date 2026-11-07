import { create } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import {
  ExecutionSchema,
  RouteQuoteSchema,
} from "@night-shares/proto/market/v1/book_pb";
import { type Address, decodeEventLog } from "viem";
import { transactionExplorerUrl } from "../../../config/arc-networks";
import { ensureRouterAllowance } from "../../../ports/chain-executor/approvals";
import {
  type ChainCommand,
  deserialize,
  serialize,
  tokenTenths,
} from "../../../ports/chain-executor/chain-executor";
import type { User } from "../../../ports/sessions/session-store";
import type { CustodyWallet } from "../../../ports/wallet-custody/wallet-custody";
import { DomainError } from "../../../shared/errors/domain-error";
import { toProto } from "../../../shared/night-key";
import { agentWallets } from "../repo/agent-wallets.sqlite";
import { type Deps, quantity } from "../use-cases/context";
import { liveAsks } from "./asks";
import { chainPool } from "./pool";
import { simulateQuote } from "./quote-simulation";
import {
  assertOrb,
  chainMarket,
  confirmed,
  nightHash,
  slippageBounds,
  userWallet,
} from "./runtime";

type Trade = Extract<ChainCommand, { kind: "buy" | "sell" }>;
type Intent = {
  id: string;
  wallet_id: string;
  human_id: string;
  command: string;
  reserved: string;
  state: string;
  result: string | null;
  request: string;
};
export function routeQuote(
  key: string,
  size: number,
  total: bigint,
  gross = total,
  fee = 0n,
) {
  return create(RouteQuoteSchema, {
    night: toProto(key),
    requested: { tenths: size },
    filled: { tenths: size },
    total: { micros: total },
    gross: { micros: gross },
    fee: { micros: fee },
    average: { micros: (gross * 10n) / BigInt(size) },
  });
}
async function prepare(
  deps: Deps,
  wallet: CustodyWallet,
  key: string,
  size: number,
  kind: "buy" | "sell",
  id: string,
  limit?: bigint,
  execute = false,
) {
  quantity({ tenths: size });
  const { reader, executor, deployment } = chainMarket(deps.ports);
  await reader.assertCurrent();
  await assertOrb(deps.ports, wallet.address);
  const head = await reader.head();
  const preparationRequest = serialize({ key, size, kind, limit });
  const prepared = execute
    ? deps.ports.db
        .query<
          {
            fingerprint: string;
            wallet_id: string;
            deadline: string;
            amount: string;
            request: string;
          },
          [string]
        >("SELECT * FROM market_chain_preparations WHERE id = ?")
        .get(id)
    : null;
  if (
    prepared &&
    (prepared.fingerprint !== reader.fingerprint ||
      prepared.wallet_id !== wallet.walletId ||
      prepared.request !== preparationRequest)
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Stale trade preparation rejected.",
    );
  const deadline = prepared ? BigInt(prepared.deadline) : head.timestamp + 300n;
  if (deadline <= head.timestamp)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Trade preparation expired. Submit a fresh request.",
    );
  const night = nightHash(key);
  const qty = tokenTenths(size);
  if (kind === "buy") {
    const cash = execute
      ? (await reader.cash(wallet.address)).value.usdc
      : 2n ** 128n;
    const amount = prepared
      ? BigInt(prepared.amount)
      : limit === undefined || limit > cash
        ? cash
        : limit;
    if (amount <= 0n)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "Insufficient USDC balance.",
      );
    if (execute && !prepared)
      deps.ports.db
        .query(
          "INSERT INTO market_chain_preparations VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          reader.fingerprint,
          wallet.walletId,
          deadline.toString(),
          amount.toString(),
          preparationRequest,
        );
    if (execute) {
      const approvals = await ensureRouterAllowance({
        reader,
        executor,
        deployment,
        walletId: wallet.walletId,
        owner: wallet.address,
        operationId: id,
        router: "TradeRouter",
        amount,
        expiration: Number((deadline / 3600n + 2n) * 3600n),
      });
      for (const result of approvals) confirmed(result);
    }
    return {
      kind,
      night,
      qty,
      maxPaid: amount,
      asks: await liveAsks(deps, key),
      hints: [],
      deadline,
    } satisfies Trade;
  }
  const allowance = (
    await reader.read<bigint>({
      contract: "NightToken",
      night,
      functionName: "allowance",
      args: [wallet.address, deployment.TradeRouter],
    })
  ).value;
  if (allowance < qty && execute)
    confirmed(
      await executor.execute({
        operationId: `${id}:approve-token`,
        walletId: wallet.walletId,
        command: { kind: "approveToken", night, amount: qty },
      }),
    );
  return {
    kind,
    night,
    qty,
    minReceived: limit ?? 0n,
    hints: [],
    deadline,
  } satisfies Trade;
}
export async function quoteChainTrade(
  deps: Deps,
  key: string,
  size: number,
  user: User | undefined,
  kind: "buy" | "sell",
  suppliedWallet?: CustodyWallet,
) {
  if (!user)
    throw new DomainError(
      "PERMISSION_DENIED",
      "Sign in to obtain an executable chain quote.",
    );
  const wallet = suppliedWallet ?? (await userWallet(deps.ports, user));
  const command = await prepare(
    deps,
    wallet,
    key,
    size,
    kind,
    deps.ports.ids.next("quote"),
  );
  const quote = await simulateQuote(deps.ports, command, wallet.address, key);
  if (typeof quote.value !== "bigint")
    throw new Error("Router quote did not return micro USDC.");
  const result = routeQuote(key, size, quote.value);
  const pool = await chainPool(deps.ports, key);
  const { reader } = chainMarket(deps.ports);
  const human = (
    await reader.read<bigint>(
      {
        contract: "HumanRegistry",
        functionName: "humanIdOf",
        args: [wallet.address],
      },
      pool.block.number,
    )
  ).value;
  const used = (
    await reader.read<bigint>(
      {
        contract: "NightToken",
        night: nightHash(key),
        functionName: "humanBalance",
        args: [human],
      },
      pool.block.number,
    )
  ).value;
  const cap = (pool.config.S * 3n) / 10n;
  result.cap = {
    $typeName: "night_shares.common.v1.RoomNights",
    tenths: Number(
      (cap > 1000000000000000000n ? cap : 1000000000000000000n) /
        100000000000000000n,
    ),
  };
  result.capUsed = {
    $typeName: "night_shares.common.v1.RoomNights",
    tenths: Number(used / 100000000000000000n),
  };
  result.releaseAt = timestampFromMs(Number(pool.config.cutoff) * 1000);
  if (pool.refund !== undefined)
    result.unsoldRefund = {
      $typeName: "night_shares.common.v1.Usdc",
      micros: (pool.refund * BigInt(size)) / 10n,
    };
  return result;
}
export async function executeChainTrade(
  deps: Deps,
  user: User,
  key: string,
  size: number,
  limit: bigint,
  kind: "buy" | "sell",
  options: {
    wallet?: CustodyWallet;
    agent?: boolean;
    operationId?: string;
  } = {},
) {
  quantity({ tenths: size });
  if (limit < 0n)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Trade limit must be nonnegative.",
    );
  const { ports } = deps;
  const { reader, executor, deployment, slippageBps } = chainMarket(ports);
  const wallet = options.wallet ?? (await userWallet(ports, user));
  const request = serialize({
    key,
    size,
    limit,
    kind,
    agent: !!options.agent,
    user,
  });
  let intent = options.operationId
    ? ports.db
        .query<Intent, [string, string]>(
          "SELECT * FROM market_chain_intents WHERE id = ? AND fingerprint = ?",
        )
        .get(options.operationId, reader.fingerprint)
    : null;
  intent ??= ports.db
    .query<Intent, [string, string]>(
      "SELECT * FROM market_chain_intents WHERE fingerprint = ? AND wallet_id = ? AND state = 'pending'",
    )
    .get(reader.fingerprint, wallet.walletId);
  if (
    intent &&
    (intent.wallet_id !== wallet.walletId ||
      intent.human_id !== user.humanId ||
      intent.request !== request ||
      (options.operationId && options.operationId !== intent.id))
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Another wallet operation is pending reconciliation.",
    );
  if (intent?.state === "finalized" && intent.result) {
    const result = deserialize<{
      total: bigint;
      gross: bigint;
      fee: bigint;
      at: number;
      transactionHash?: string;
    }>(intent.result);
    return create(ExecutionSchema, {
      id: intent.id,
      transactionHash: result.transactionHash ?? "",
      explorerUrl: transactionExplorerUrl(result.transactionHash ?? ""),
      quote: routeQuote(key, size, result.total, result.gross, result.fee),
      executedAt: timestampFromMs(result.at),
    });
  }
  if (intent?.state === "reverted")
    throw new DomainError("FAILED_PRECONDITION", "Chain transaction reverted.");
  if (!intent) {
    const id = options.operationId ?? ports.ids.next("trade");
    const command = await prepare(
      deps,
      wallet,
      key,
      size,
      kind,
      id,
      limit,
      true,
    );
    const simulated =
      chainMarket(ports).network && chainMarket(ports).network !== "fork"
        ? await simulateQuote(ports, command, wallet.address, key)
        : await reader.simulate(command, wallet.address);
    if (typeof simulated.value !== "bigint")
      throw new Error("Router quote did not return micro USDC.");
    const bounds = slippageBounds(simulated.value, slippageBps);
    if (command.kind === "sell")
      command.minReceived = bounds.min > limit ? bounds.min : limit;
    // The approval may cover the caller's cap, but the router command never
    // pays more than the simulated price plus the slippage allowance.
    if (command.kind === "buy" && bounds.max < command.maxPaid)
      command.maxPaid = bounds.max;
    const reserved = command.kind === "buy" ? command.maxPaid : 0n;
    intent = {
      id,
      wallet_id: wallet.walletId,
      human_id: user.humanId,
      command: serialize(command),
      reserved: reserved.toString(),
      state: "pending",
      result: null,
      request,
    };
    ports.db.transaction(() => {
      if (options.agent) agentWallets(ports.db).check(user, key, reserved);
      ports.db
        .query(
          "INSERT INTO market_chain_intents (id,fingerprint,wallet_id,human_id,night_key,command,agent,reserved,request) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          reader.fingerprint,
          wallet.walletId,
          user.humanId,
          key,
          serialize(command),
          options.agent ? 1 : 0,
          reserved.toString(),
          request,
        );
    })();
  }
  const saved = intent;
  const command = deserialize<Trade>(saved.command);
  let result: Awaited<ReturnType<typeof executor.execute>>;
  try {
    result = await executor.execute({
      operationId: saved.id,
      walletId: wallet.walletId,
      command,
    });
  } catch (error) {
    // Before signing, failure is definitive. Signed/submitted failures require recovery.
    const journal = ports.db
      .query<{ state: string }, [string]>(
        "SELECT state FROM chain_operations WHERE id = ?",
      )
      .get(saved.id);
    if (!journal || journal.state === "reverted") compensate();
    throw error;
  }
  if (result.state === "reverted") compensate();
  const receipt = confirmed(result);
  let gross = 0n,
    fee = 0n,
    filled = 0n;
  for (const log of receipt.logs) {
    const contract =
      log.address.toLowerCase() === deployment.TradeRouter.toLowerCase()
        ? "TradeRouter"
        : log.address.toLowerCase() === deployment.NightHook.toLowerCase()
          ? "NightHook"
          : undefined;
    if (!contract) continue;
    let event: { eventName: string; args: unknown };
    try {
      event = decodeEventLog({
        abi: deployment.abis[contract] ?? [],
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (event.eventName !== "Trade") continue;
    const args = event.args as unknown as {
      night: string;
      taker: Address;
      side: number;
      qty: bigint;
      notional: bigint;
      fee: bigint;
    };
    if (
      args.night !== command.night ||
      args.taker.toLowerCase() !== wallet.address.toLowerCase() ||
      Number(args.side) !== (kind === "buy" ? 0 : 1)
    )
      continue;
    gross += args.notional;
    fee += args.fee;
    filled += args.qty;
  }
  if (filled !== command.qty)
    throw new Error(
      "Receipt trade quantity does not match reserved intent; reconciliation required.",
    );
  const total = kind === "buy" ? gross + fee : gross - fee;
  const at =
    Number(
      (
        await reader.read<bigint>(
          {
            contract: "NightToken",
            night: command.night,
            functionName: "balanceOf",
            args: [wallet.address],
          },
          receipt.blockNumber,
        )
      ).block.timestamp,
    ) * 1000;
  ports.db.transaction(() => {
    const current = ports.db
      .query<{ state: string }, [string]>(
        "SELECT state FROM market_chain_intents WHERE id = ?",
      )
      .get(saved.id);
    if (current?.state !== "pending") return;
    ports.activity.append({
      nightKey: key,
      propertyId: key.split(":")[0] ?? "",
      kind: options.agent
        ? "agent_order_filled"
        : kind === "buy"
          ? "trader_bought"
          : "trader_sold_back",
      actor: options.agent ? "agent" : "trader",
      userId: user.id,
      tenths: size,
      priceMicros: (gross * 10n) / BigInt(size),
    });
    if (options.agent)
      ports.db
        .query(
          "UPDATE market_agent_wallets SET spent = spent + ? WHERE human_id = ?",
        )
        .run(total, user.humanId);
    ports.db
      .query(
        "UPDATE market_chain_intents SET state = 'finalized', result = ? WHERE id = ?",
      )
      .run(
        serialize({
          total,
          gross,
          fee,
          at,
          transactionHash: receipt.transactionHash,
        }),
        saved.id,
      );
  })();
  return create(ExecutionSchema, {
    id: saved.id,
    transactionHash: receipt.transactionHash,
    explorerUrl: transactionExplorerUrl(receipt.transactionHash),
    quote: routeQuote(key, size, total, gross, fee),
    executedAt: timestampFromMs(at),
  });
  function compensate() {
    ports.db.transaction(() => {
      ports.db
        .query(
          "UPDATE market_chain_intents SET state = 'reverted' WHERE id = ? AND state = 'pending'",
        )
        .run(saved.id);
    })();
  }
}
