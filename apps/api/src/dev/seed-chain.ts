import { create } from "@bufbuild/protobuf";
import { OpenNightsSelectionSchema } from "@night-shares/proto/host/v1/opening_pb";
import {
  type Address,
  formatUnits,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { type Config, loadConfig } from "../config/load-config";
import { buildContainer, type Container } from "../container/build-container";
import { createSqliteHostRepo } from "../modules/host/repo/host-repo.sqlite";
import { createHostUseCases } from "../modules/host/use-cases/create-host-use-cases";
import { createSqliteUserRepo } from "../modules/identity/repo/user-repo.sqlite";
import { createCompleteSignIn } from "../modules/identity/use-cases/sign-in/complete-sign-in";
import { createStartSignIn } from "../modules/identity/use-cases/sign-in/start-sign-in";
import { nightHash } from "../modules/market/chain/runtime";
import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";
import { deserialize } from "../ports/chain-executor/chain-executor";
import { chainStatus } from "../ports/chain-status/chain-status";
import type { createOnchainChainStatus } from "../ports/chain-status/chain-status.onchain";
import { mockSubjectFor } from "../ports/identity-verifier/identity-verifier.mock";
import { anvilAccount } from "../ports/wallet-custody/wallet-custody.anvil";
import { addDays } from "../shared/dates";

function forkConfig(env = process.env) {
  if (env.ARC_NETWORK && env.ARC_NETWORK !== "fork")
    throw new Error("seed:fork requires ARC_NETWORK=fork.");
  assertLocalForkRpc(env.ARC_RPC_URL ?? "http://127.0.0.1:8545");
  const key = anvilAccount(9).getHdKey().privateKey;
  if (!key) throw new Error("Missing local fixture attester.");
  return loadConfig({
    ...env,
    ARC_NETWORK: "fork",
    CHAIN_STATUS: "onchain",
    WALLET_CUSTODY: env.WALLET_CUSTODY ?? "anvil",
    WORLD_ID_MODE: "mock",
    FORK_FAUCET: env.WALLET_CUSTODY === "privy" ? "false" : "true",
    FORK_ATTESTER_KEY: env.FORK_ATTESTER_KEY ?? toHex(key),
    DB_PATH: env.DB_PATH ?? "./data/fork-clicktest.db",
  });
}

export function seedConfig(env = process.env) {
  if (env.ARC_NETWORK === "mainnet") throw new Error("Seed refuses mainnet.");
  if (env.CHAIN_EXECUTION === "off")
    throw new Error("Chain execution is disabled (CHAIN_EXECUTION=off).");
  if (!env.ARC_NETWORK || env.ARC_NETWORK === "fork") return forkConfig(env);
  if (env.ARC_NETWORK !== "testnet")
    throw new Error("Seed requires fork or testnet.");
  if (env.WALLET_CUSTODY && env.WALLET_CUSTODY !== "privy")
    throw new Error("Testnet seed requires WALLET_CUSTODY=privy.");
  return loadConfig({
    ...env,
    WALLET_CUSTODY: "privy",
    WORLD_ID_MODE: "mock",
    CHAIN_STATUS: "onchain",
    DB_PATH: env.DB_PATH ?? "./data/testnet-rehearsal.db",
  });
}

export function traderAmount(value = "2") {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value) || parseUnits(value, 6) <= 0n)
    throw new Error(
      "SEED_TRADER_USDC must be positive with at most six decimals.",
    );
  return parseUnits(value, 6);
}

export function assertSeedBudget(
  native: bigint,
  usdc: bigint,
  floats: bigint,
  funding: bigint,
  minimum: bigint,
  fees = 0n,
) {
  // Arc native USDC and ERC-20 USDC expose the same funds at different decimals.
  const required = floats + funding * 10n ** 12n + minimum + fees;
  const shortfall = required > native ? required - native : 0n;
  const tokenShortfall = funding > usdc ? funding - usdc : 0n;
  if (shortfall || tokenShortfall)
    throw new Error(
      `Seed ops budget shortfall: ${formatUnits(shortfall, 18)} native USDC; ${formatUnits(tokenShortfall, 6)} ERC-20 USDC. Required native balance: ${formatUnits(required, 18)} USDC.`,
    );
  return {
    gasFloats: formatUnits(floats, 18),
    opsFeeAllowance: formatUnits(fees, 18),
    traderUsdc: formatUnits(funding, 6),
    minimumBalance: formatUnits(minimum, 18),
    requiredBalance: formatUnits(required, 18),
  };
}

export async function seedChain(
  { ports }: Container,
  config: Config,
  amount = traderAmount(),
) {
  const network = config.chain?.network ?? config.arcNetwork;
  if (network !== "fork" && network !== "testnet")
    throw new Error("Seed refuses mainnet; requires fork or testnet.");
  if (
    config.chainExecution === false ||
    ports.chainExecutor?.executionEnabled === false
  )
    throw new Error("Chain execution is disabled (CHAIN_EXECUTION=off).");
  if (network === "testnet" && config.walletCustody !== "privy")
    throw new Error("Testnet seed requires WALLET_CUSTODY=privy.");
  const privy = config.walletCustody === "privy";
  const prefix = privy ? "testnet-rehearsal" : "fork-click";
  if (
    ports.chainExecutor?.mode !== "chain" ||
    !ports.chainReader ||
    !ports.provisionWallet
  )
    throw new Error(
      "Seed requires chain execution, a reader and wallet provisioning.",
    );
  const reader = ports.chainReader;
  const custody = ports.walletProvider.custody;
  const fundingId = `seed:${reader.fingerprint}:${prefix}:trader-funding`;
  const fundingOperation = ports.db
    .query<{ state: string; command: string }, [string]>(
      "SELECT state, command FROM chain_operations WHERE id = ?",
    )
    .get(fundingId);
  if (fundingOperation)
    amount = deserialize<{ amount: bigint }>(fundingOperation.command).amount;
  let budget: ReturnType<typeof assertSeedBudget> | undefined;
  if (privy) {
    if (!custody || !config.gasPolicy || !ports.chainAttester)
      throw new Error("Seed requires custody, attester and gas policy.");
    const wallets = [];
    for (const role of ["host", "trader"])
      wallets.push(
        await custody.createWallet({
          kind: "user",
          humanId: mockSubjectFor(`${prefix}-${role}`),
        }),
      );
    const ops = await custody.resolveWallet?.("chain:ops");
    if (!ops) throw new Error("Seed ops wallet unavailable.");
    const addresses = new Set([
      ...wallets.map((w) => w.address.toLowerCase()),
      ports.chainAttester.address.toLowerCase(),
    ]);
    let floats = 0n;
    let transfers = 0n;
    for (const address of addresses) {
      if (address === ops.address.toLowerCase()) continue;
      const balance = (await reader.cash(address as Address)).value.native;
      if (balance < config.gasPolicy.lowWater) {
        floats += config.gasPolicy.float - balance;
        transfers++;
      }
    }
    const completed = fundingOperation?.state === "finalized";
    if (!reader.client) throw new Error("Seed requires a chain RPC client.");
    // Reserve 100,000 gas per ops transfer, above a simple native/ERC-20 transfer.
    // The executor still estimates each transaction and applies its own headroom.
    const fees =
      (await reader.client.estimateFeesPerGas()).maxFeePerGas *
      100_000n *
      (transfers + (completed ? 0n : 1n));
    const cash = (await reader.cash(ops.address)).value;
    budget = assertSeedBudget(
      cash.native,
      cash.usdc,
      floats,
      completed ? 0n : amount,
      config.gasPolicy.opsMinBalance,
      fees,
    );
  }
  const login = async (seed: string, index: number) => {
    if (!privy) {
      const owner = `user:${mockSubjectFor(seed)}`;
      const wallet = anvilAccount(index);
      ports.db
        .query("INSERT OR IGNORE INTO anvil_wallets VALUES (?, ?, ?, ?)")
        .run(owner, index, `anvil:${index}`, wallet.address);
      const saved = ports.db
        .query<{ derivation_index: number }, [string]>(
          "SELECT derivation_index FROM anvil_wallets WHERE owner = ?",
        )
        .get(owner);
      if (Number(saved?.derivation_index) !== index)
        throw new Error(
          "Seed custody allocation conflicts with an existing wallet.",
        );
    }
    const request = await createStartSignIn(ports)("orb");
    return createCompleteSignIn({
      ...ports,
      repo: createSqliteUserRepo(ports),
    })({ requestId: request.requestId, proof: `mock:${seed}:orb` });
  };
  const host = await login(`${prefix}-host`, 80001);
  const trader = await login(`${prefix}-trader`, 80002);
  if (privy) {
    const existing = ports.db
      .query<{ state: string }, [string]>(
        "SELECT state FROM chain_operations WHERE id = ?",
      )
      .get(fundingId);
    if (existing?.state !== "finalized") {
      const result = existing
        ? await ports.chainExecutor.recover(fundingId)
        : await ports.chainExecutor.execute({
            operationId: fundingId,
            walletId: "chain:ops",
            command: {
              kind: "transfer",
              to: trader.user.walletAddress as Address,
              amount,
            },
          });
      if (result.state !== "finalized")
        throw new Error(
          `Trader funding requires reconciliation: ${result.state} (${result.hash ?? fundingId}).`,
        );
    }
  }
  const cases = createHostUseCases({
    ports,
    repo: createSqliteHostRepo(ports),
  });
  let property: ReturnType<typeof ports.catalog.get>;
  for (const candidate of ports.catalog
    .list()
    .filter((p) => ["prop_salinas", "prop_machiya"].includes(p.id))) {
    const owner = (
      await reader.read<Address>({
        contract: "NightFactory",
        functionName: "ownerOf",
        args: [nightHash(candidate.id)],
      })
    ).value;
    if (owner.toLowerCase() === host.user.walletAddress.toLowerCase()) {
      property = candidate;
      break;
    }
    if (!property && owner === zeroAddress) property = candidate;
  }
  if (!property)
    throw new Error("No available catalog property for chain seed.");
  await cases.connectChannelManager(
    host.user.id,
    property.id,
    1,
    host.user.walletAddress,
  );
  const room = property.roomTypes[0];
  if (!room) throw new Error("Missing catalog room.");
  const today = new Date(Number((await reader.head()).timestamp) * 1000)
    .toISOString()
    .slice(0, 10);
  ports.db.exec(
    "CREATE TABLE IF NOT EXISTS dev_seed_plans (id TEXT PRIMARY KEY, property TEXT NOT NULL, dates TEXT NOT NULL)",
  );
  const planId = `seed:${reader.fingerprint}:${prefix}`;
  const savedPlan = ports.db
    .query<{ property: string; dates: string }, [string]>(
      "SELECT property, dates FROM dev_seed_plans WHERE id = ?",
    )
    .get(planId);
  if (savedPlan && savedPlan.property !== property.id)
    throw new Error("Seed property changed; retain original binding.");
  const dates: string[] = savedPlan
    ? JSON.parse(savedPlan.dates)
    : (privy ? [3, 4] : [3, 4, 5]).map((days) => addDays(today, days));
  ports.db
    .query("INSERT OR IGNORE INTO dev_seed_plans VALUES (?, ?, ?)")
    .run(planId, property.id, JSON.stringify(dates));
  const keys = [];
  for (const date of dates) {
    const key = `${property.id}:${room.id}:${date}`;
    const token = (
      await reader.read<Address>({
        contract: "NightFactory",
        functionName: "tokenOf",
        args: [nightHash(key)],
      })
    ).value;
    await (
      chainStatus(ports) as ReturnType<typeof createOnchainChainStatus>
    ).refresh();
    const opening = ports.db
      .query<{ status: string }, [string, string]>(
        "SELECT status FROM host_chain_openings WHERE fingerprint = ? AND night_key = ?",
      )
      .get(reader.fingerprint, key);
    if (token === zeroAddress && !opening)
      ports.inventory.update(key, (record) => ({
        ...record,
        state: { ...record.state, F: 0.5 },
      }));
    if (token === zeroAddress || (opening && opening.status !== "complete"))
      await cases.openNights(
        host.user.id,
        create(OpenNightsSelectionSchema, {
          propertyId: property.id,
          roomTypeIds: [room.id],
          dates: [date],
          allotmentPercent: 10,
          demandPreset: 1,
          releasePolicy: 1,
        }),
      );
    keys.push(key);
  }
  return {
    nights: keys,
    trader: `${prefix}-trader`,
    hostWallet: host.user.walletAddress,
    traderWallet: trader.user.walletAddress,
    budget,
    transactions: ports.db
      .query(
        "SELECT id, state, tx_hash FROM chain_operations WHERE fingerprint = ? AND tx_hash IS NOT NULL",
      )
      .all(reader.fingerprint),
    wallet: trader.user.walletAddress,
    login: `Choose Orb, enter mock seed ${prefix}-trader, then verify. Switch account first if already signed in.`,
  };
}
if (import.meta.main) {
  if (
    process.argv[2] === "testnet" &&
    process.env.ARC_NETWORK &&
    process.env.ARC_NETWORK !== "testnet"
  )
    throw new Error(
      "seed:testnet requires ARC_NETWORK=testnet; mainnet is refused.",
    );
  const config = seedConfig({
    ...process.env,
    ARC_NETWORK:
      process.env.ARC_NETWORK ??
      (process.argv[2] === "testnet" ? "testnet" : undefined),
  });
  const amount = traderAmount(process.env.SEED_TRADER_USDC);
  const container = buildContainer(config);
  try {
    console.info(
      JSON.stringify(await seedChain(container, config, amount), null, 2),
    );
  } finally {
    container.ports.db.close();
  }
}
