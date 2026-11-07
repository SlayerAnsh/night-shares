import { expect, test } from "bun:test";
import { bytesToHex, keccak256, toBytes } from "viem";
import { loadDeployment } from "../../../ports/arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../../../ports/arc-deployment/local-fork";
import {
  forkClient,
  validateDeployment,
} from "../../../ports/arc-deployment/validate";
import { createChainAttester } from "../../../ports/chain-attester/chain-attester";
import { createChainExecutor } from "../../../ports/chain-executor/chain-executor.viem";
import { createChainReader } from "../../../ports/chain-reader/chain-reader.viem";
import { forkProvisioner } from "../../../ports/wallet-custody/provision-fork";
import {
  anvilAccount,
  createAnvilWalletCustody,
} from "../../../ports/wallet-custody/wallet-custody.anvil";
import { createForkWalletProvider } from "../../../ports/wallet-provider/wallet-provider.fork";
import { ensureChainIdentity } from "../../identity/chain-ready";
import { fixture } from "../use-cases/fixture";
import { bindProperty } from "./bind";
import { isolatedHostFork } from "./fork-fixture";
import { openChainNights } from "./open";

const forkTest = process.env.FORK_IT === "1" ? test : test.skip;
forkTest(
  "host fork: identity, permanent bind, 100 rooms, chunk restart and PMS recovery",
  async () => {
    const upstream = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545";
    assertLocalForkRpc(upstream);
    const deployment = loadDeployment("fork", process.env.ARC_DEPLOYMENT_FILE);
    if (!deployment) throw new Error("Deployment required.");
    const isolated = await isolatedHostFork(upstream, deployment.block);
    const rpcUrl = isolated.rpcUrl;
    try {
      const client = forkClient(rpcUrl);
      const fingerprint = await validateDeployment(deployment, client);
      const deps = fixture();
      const { ports, userId } = deps;
      const reader = createChainReader(
        ports.db,
        deployment,
        client,
        fingerprint,
      );
      const base = createAnvilWalletCustody({
        db: ports.db,
        network: "fork",
        deployment,
        rpcUrl,
      });
      // Reserve a random high range; parallel integration suites must not share senders.
      const index = 100000 + Math.floor(Math.random() * 1000000);
      ports.db
        .query("INSERT INTO anvil_wallets VALUES (?, ?, ?, ?)")
        .run(
          "test:reserved",
          index,
          `anvil:${index}`,
          anvilAccount(index).address,
        );
      // Public local Anvil fixture only. Production signing still requires FORK_ATTESTER_KEY.
      const key = anvilAccount(9).getHdKey().privateKey;
      if (!key) throw new Error("Fixture key unavailable.");
      const signing = createChainAttester(deployment, () => bytesToHex(key));
      const custody = {
        ...base,
        resolveWallet: async (id: string) => {
          const result = await (id === "fork:attester"
            ? signing.custody
            : base
          ).resolveWallet?.(id);
          if (!result) throw new Error("Missing fixture custody.");
          return result;
        },
        signTransaction: async (
          id: string,
          tx: Parameters<NonNullable<typeof base.signTransaction>>[1],
        ) => {
          const result = await (id === "fork:attester"
            ? signing.custody
            : base
          ).signTransaction?.(id, tx);
          if (!result) throw new Error("Missing fixture signer.");
          return result;
        },
      };
      const executor = createChainExecutor({
        db: ports.db,
        deployment,
        client,
        reader,
        custody,
      });
      Object.assign(ports, {
        chainExecutor: executor,
        chainReader: reader,
        chainAttester: signing.attester,
        walletProvider: createForkWalletProvider(custody, reader),
        provisionWallet: forkProvisioner({
          db: ports.db,
          rpcUrl,
          client,
          fingerprint,
          executor,
          reader,
        }),
      });
      const subject = keccak256(toBytes(`host-task2:${index}`));
      const wallet = await custody.createWallet({
        kind: "user",
        humanId: subject,
      });
      const user = {
        id: userId,
        humanId: subject,
        walletAddress: wallet.address,
        level: "orb" as const,
      };
      ports.db
        .query(
          "INSERT INTO identity_users (id, human_id, wallet_address, level) VALUES (?, ?, ?, ?)",
        )
        .run(userId, subject, wallet.address, "orb");
      await ensureChainIdentity(ports, user);
      expect(
        (
          await reader.read({
            contract: "HumanRegistry",
            functionName: "humanIdOf",
            args: [wallet.address],
          })
        ).value,
      ).toBe(BigInt(subject));
      // Give this fixture a unique catalog identity without relying on seeded chain nights.
      const propertyId = `task2_${index}`;
      const originalGet = ports.catalog.get.bind(ports.catalog);
      const template = originalGet("prop_velana");
      if (!template?.roomTypes[0]) throw new Error("Missing catalog fixture.");
      ports.catalog.get = (id) =>
        id === propertyId ? { ...template, id: propertyId } : originalGet(id);
      deps.repo.claim(userId, propertyId);
      await bindProperty(deps, userId, propertyId, wallet.address);
      await expect(
        bindProperty(deps, userId, propertyId, anvilAccount(index + 2).address),
      ).rejects.toThrow("permanent");
      const date = new Date(
        (Number((await reader.head()).timestamp) + 10 * 86400) * 1000,
      )
        .toISOString()
        .slice(0, 10);
      const record = ports.inventory.seedNight({
        propertyId,
        roomTypeId: template.roomTypes[0].id,
        date,
      });
      record.state.F = 0.01;
      record.openedAt = 0;
      ports.inventory.save(record);
      const plan = {
        record,
        tenths: 1000,
        preset: "calm" as const,
        releasePolicy: 1,
        kept: false,
      };
      await expect(
        openChainNights(deps, userId, [{ ...plan, tenths: 1010 }]),
      ).rejects.toThrow("whole rooms");
      await expect(
        openChainNights(deps, userId, [
          {
            ...plan,
            record: { ...record, state: { ...record.state, F: 1.01 } },
          },
        ]),
      ).rejects.toThrow("limits");
      await expect(
        openChainNights(deps, userId, [
          {
            ...plan,
            preset: "peak",
            record: { ...record, state: { ...record.state, F: 1 } },
          },
        ]),
      ).rejects.toThrow("limits");
      const originalRead = reader.read.bind(reader);
      reader.read = async <T>(
        request: Parameters<typeof reader.read>[0],
        blockNumber?: bigint,
      ) =>
        request.functionName === "openNights"
          ? { block: await reader.head(), value: 20n as T }
          : originalRead<T>(request, blockNumber);
      await expect(openChainNights(deps, userId, [plan])).rejects.toThrow(
        "limits",
      );
      reader.read = originalRead;
      expect(
        ports.db.query("SELECT * FROM host_chain_openings").all(),
      ).toHaveLength(0);
      let chunks = 0;
      ports.chainExecutor = {
        ...executor,
        async execute(request) {
          if (request.command.kind === "addChunk" && chunks++ === 3)
            throw new Error("Injected chunk interruption");
          return executor.execute(request);
        },
      };
      await expect(openChainNights(deps, userId, [plan])).rejects.toThrow(
        "Injected chunk interruption",
      );
      const night = keccak256(toBytes(record.key));
      expect(
        (
          await reader.read({
            contract: "NightVault",
            functionName: "nextRoom",
            args: [night],
          })
        ).value,
      ).toBe(30n);
      expect(ports.inventory.get(record.key).openedAt).toBe(0);
      ports.chainExecutor = createChainExecutor({
        db: ports.db,
        deployment,
        client,
        reader,
        custody,
      });
      const push = ports.channelManager.pushInventory;
      ports.channelManager.pushInventory = async () => {
        throw new Error("PMS unavailable");
      };
      await expect(openChainNights(deps, userId, [plan])).rejects.toThrow(
        "acknowledgement is pending",
      );
      expect(
        (
          await reader.read({
            contract: "NightFactory",
            functionName: "ladderComplete",
            args: [night],
          })
        ).value,
      ).toBe(true);
      expect(ports.inventory.get(record.key).openedAt).toBe(0);
      ports.channelManager.pushInventory = push;
      await openChainNights(deps, userId, [plan]);
      expect(ports.inventory.get(record.key).openedAt).toBeGreaterThan(0);
      await expect(openChainNights(deps, userId, [plan])).rejects.toThrow(
        "allotment edits",
      );
    } finally {
      isolated.stop();
    }
  },
  180000,
);
