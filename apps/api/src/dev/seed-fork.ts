import { create } from "@bufbuild/protobuf";
import { OpenNightsSelectionSchema } from "@night-shares/proto/host/v1/opening_pb";
import { type Address, toHex, zeroAddress } from "viem";
import { loadConfig } from "../config/load-config";
import { buildContainer, type Container } from "../container/build-container";
import { createSqliteHostRepo } from "../modules/host/repo/host-repo.sqlite";
import { createHostUseCases } from "../modules/host/use-cases/create-host-use-cases";
import { createSqliteUserRepo } from "../modules/identity/repo/user-repo.sqlite";
import { createCompleteSignIn } from "../modules/identity/use-cases/sign-in/complete-sign-in";
import { createStartSignIn } from "../modules/identity/use-cases/sign-in/start-sign-in";
import { nightHash } from "../modules/market/chain/runtime";
import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";
import { chainStatus } from "../ports/chain-status/chain-status";
import type { createOnchainChainStatus } from "../ports/chain-status/chain-status.onchain";
import { mockSubjectFor } from "../ports/identity-verifier/identity-verifier.mock";
import { anvilAccount } from "../ports/wallet-custody/wallet-custody.anvil";
import { addDays } from "../shared/dates";

export function seedConfig(env = process.env) {
  if (env.ARC_NETWORK && env.ARC_NETWORK !== "fork")
    throw new Error("seed:fork requires ARC_NETWORK=fork.");
  assertLocalForkRpc(env.ARC_RPC_URL ?? "http://127.0.0.1:8545");
  const key = anvilAccount(9).getHdKey().privateKey;
  if (!key) throw new Error("Missing local fixture attester.");
  return loadConfig({
    ...env,
    ARC_NETWORK: "fork",
    CHAIN_STATUS: "onchain",
    WALLET_CUSTODY: "anvil",
    WORLD_ID_MODE: "mock",
    FORK_FAUCET: "true",
    FORK_ATTESTER_KEY: env.FORK_ATTESTER_KEY ?? toHex(key),
    DB_PATH: env.DB_PATH ?? "./data/fork-clicktest.db",
  });
}

export async function seedFork({ ports }: Container) {
  if (
    ports.chainExecutor?.mode !== "chain" ||
    !ports.chainReader ||
    !ports.provisionWallet
  )
    throw new Error("seed:fork requires fork execution.");
  const reader = ports.chainReader;
  const login = async (seed: string, index: number) => {
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
    const request = await createStartSignIn(ports)("orb");
    return createCompleteSignIn({
      ...ports,
      repo: createSqliteUserRepo(ports),
    })({ requestId: request.requestId, proof: `mock:${seed}:orb` });
  };
  const host = await login("fork-click-host", 80001);
  const trader = await login("fork-click-trader", 80002);
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
    throw new Error("No available catalog property for fork seed.");
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
  const dates = [3, 4, 5].map((days) => addDays(today, days));
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
    trader: "fork-click-trader",
    wallet: trader.user.walletAddress,
    login:
      "Choose Orb, enter mock seed fork-click-trader, then verify. Switch account first if already signed in.",
  };
}
if (import.meta.main) {
  const container = buildContainer(seedConfig());
  try {
    console.info(JSON.stringify(await seedFork(container), null, 2));
  } finally {
    container.ports.db.close();
  }
}
