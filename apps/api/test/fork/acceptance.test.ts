import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { create } from "@bufbuild/protobuf";
import { CreateBookingRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import {
  StayQuoteSchema,
  StaySelectionSchema,
} from "@night-shares/proto/stay/v1/trip_pb";
import {
  type Address,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  stringToHex,
  toHex,
} from "viem";
import { buildContainer } from "../../src/container/build-container";
import { runChainJobs } from "../../src/jobs/chain";
import { bindProperty } from "../../src/modules/host/chain/bind";
import { openChainNights } from "../../src/modules/host/chain/open";
import { createSqliteHostRepo } from "../../src/modules/host/repo/host-repo.sqlite";
import { ensureChainIdentity } from "../../src/modules/identity/chain-ready";
import { createIdentityModule } from "../../src/modules/identity/module";
import { askRows } from "../../src/modules/market/chain/asks";
import { createSqliteMarketRepo } from "../../src/modules/market/repo/market-repo.sqlite";
import { confirmed, receiptEvents } from "../../src/modules/stay/chain/context";
import { createSqliteStayRepo } from "../../src/modules/stay/repo/stay-repo.sqlite";
import { createStayCases } from "../../src/modules/stay/use-cases/create-stay-cases";
import { loadDeployment } from "../../src/ports/arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../../src/ports/arc-deployment/local-fork";
import {
  forkClient,
  validateDeployment,
} from "../../src/ports/arc-deployment/validate";
import { createChainAttester } from "../../src/ports/chain-attester/chain-attester";
import type {
  ChainCommand,
  NightConfig,
} from "../../src/ports/chain-executor/chain-executor";
import { createChainExecutor } from "../../src/ports/chain-executor/chain-executor.viem";
import { usdcAbi } from "../../src/ports/chain-executor/codecs";
import { createChainReader } from "../../src/ports/chain-reader/chain-reader.viem";
import type { MockClock } from "../../src/ports/clock/clock.mock";
import type { WalletCustody } from "../../src/ports/wallet-custody/wallet-custody";
import {
  anvilAccount,
  createAnvilWalletCustody,
} from "../../src/ports/wallet-custody/wallet-custody.anvil";
import { createForkWalletProvider } from "../../src/ports/wallet-provider/wallet-provider.fork";
import { toProto } from "../../src/shared/night-key";
import { createHarness } from "../e2e/harness";

const forkTest = process.env.FORK_IT === "1" ? test : test.skip;
forkTest(
  "fork acceptance: API market, host opening, recall, recovery, keeper reconciliation and cutoff fallback",
  async () => {
    const upstream = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545";
    assertLocalForkRpc(upstream);
    const d = loadDeployment("fork", process.env.ARC_DEPLOYMENT_FILE);
    if (!d) throw new Error("Deployment required.");
    const upstreamClient = forkClient(upstream);
    await validateDeployment(d, upstreamClient);
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing child port.");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const rpc = `http://127.0.0.1:${address.port}`;
    // Time changes and fixture identity linking are isolated from the shared fork.
    const child = Bun.spawn(
      [
        "anvil",
        "--silent",
        "--port",
        String(address.port),
        "--chain-id",
        "5042",
        "--fork-url",
        upstream,
        "--fork-block-number",
        String(await upstreamClient.getBlockNumber()),
      ],
      { stdout: "ignore", stderr: "ignore" },
    );
    const container = buildContainer({
      port: 0,
      adapters: "mock",
      dbPath: ":memory:",
      devTagIssuer: true,
    });
    const { ports } = container;
    let harness: Awaited<ReturnType<typeof createHarness>> | undefined;
    try {
      const client = forkClient(rpc);
      for (let i = 0; ; i++) {
        try {
          await client.getChainId();
          break;
        } catch {
          if (i >= 100) throw new Error("Child fork failed to start.");
          await Bun.sleep(100);
        }
      }
      const reader = createChainReader(
        ports.db,
        d,
        client,
        await validateDeployment(d, client),
      );
      const anvil = createAnvilWalletCustody({
        db: ports.db,
        network: "fork",
        deployment: d,
        rpcUrl: rpc,
      });
      // This test owns a fresh range, independent of all other integration tasks.
      const firstIndex = 90001 + Math.floor(Math.random() * 10000);
      const sentinel = anvilAccount(firstIndex);
      ports.db
        .query("INSERT INTO anvil_wallets VALUES (?, ?, ?, ?)")
        .run(
          "test:sentinel",
          firstIndex,
          `anvil:${firstIndex}`,
          sentinel.address,
        );
      // Public Anvil fixture signer is only used inside this disposable test fork.
      const fixtureAttester = anvilAccount(9);
      if (fixtureAttester.address.toLowerCase() !== d.ATTESTER.toLowerCase())
        throw new Error("Unexpected fixture attester.");
      const key = fixtureAttester.getHdKey().privateKey;
      if (!key) throw new Error("Missing fixture signing key.");
      const signing = createChainAttester(d, () => toHex(key));
      const custody: WalletCustody = {
        ...anvil,
        resolveWallet: (id) =>
          id === "fork:attester"
            ? required(signing.custody.resolveWallet)(id)
            : required(anvil.resolveWallet)(id),
        signTransaction: (id, tx) =>
          id === "fork:attester"
            ? required(signing.custody.signTransaction)(id, tx)
            : required(anvil.signTransaction)(id, tx),
      };
      const executor = createChainExecutor({
        db: ports.db,
        deployment: d,
        client,
        reader,
        custody,
      });
      ports.chainExecutor = executor;
      ports.chainReader = reader;
      ports.chainAttester = signing.attester;
      ports.walletProvider = createForkWalletProvider(custody, reader);
      const rpcCall = async (method: string, params: unknown[]) => {
        const response = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const body = (await response.json()) as { error?: unknown };
        if (body.error) throw new Error(JSON.stringify(body.error));
      };
      await rpcCall("anvil_setBalance", [
        fixtureAttester.address,
        toHex(10n ** 21n),
      ]);
      let serial = 0;
      const execute = async (walletId: string, command: ChainCommand) => {
        const result = await executor.execute({
          operationId: `fixture:${++serial}`,
          walletId,
          command,
        });
        confirmed(result);
        return result;
      };
      ports.provisionWallet = async (wallet) => {
        await rpcCall("anvil_setBalance", [wallet.address, toHex(10n ** 21n)]);
      };
      // Real enrollment nullifiers use canonical 0x uint256 encoding.
      const verify = ports.identityVerifier.verifyProof.bind(
        ports.identityVerifier,
      );
      ports.identityVerifier.verifyProof = async (input) => {
        const proof = await verify(input);
        return {
          ...proof,
          subject: `0x${proof.subject}`,
          nullifier: `0x${proof.nullifier}`,
        };
      };
      container.modules.identity = createIdentityModule(ports);
      harness = await createHarness(container);
      const users = [];
      for (let i = 0; i < 6; i++) {
        const session = await harness.signIn(
          i === 5 ? "device" : "orb",
          `task5-${firstIndex}-${i}`,
        );
        const user = required(ports.sessions.get(session.sessionToken));
        const wallet = required(
          await custody.getWallet({ kind: "user", humanId: user.humanId }),
        );
        await ports.provisionWallet(wallet);
        await execute(wallet.walletId, {
          kind: "provisionToken",
          to: wallet.address,
          amount: 100_000_000n,
        });
        await ensureChainIdentity(ports, user);
        users.push({
          wallet,
          id: user.humanId,
          user,
          clients: session.clients,
        });
      }
      const host = required(users[0]);
      const guest = required(users[5]);
      const now = Number((await reader.head()).timestamp) * 1000;
      (ports.clock as MockClock).set(now);
      const date = new Date(now + 2 * 86400000).toISOString().slice(0, 10);
      const checkout = new Date(Date.parse(date) + 86400000)
        .toISOString()
        .slice(0, 10);
      const propertyId = "prop_velana",
        roomTypeId = "rt_velana_0";
      const night = keccak256(
        stringToHex(`${propertyId}:${roomTypeId}:${date}`),
      );
      const hostRepo = createSqliteHostRepo(ports);
      ports.db
        .query("INSERT INTO host_owners VALUES (?, ?)")
        .run(propertyId, host.user.id);
      const hostDeps = { ports, repo: hostRepo };
      await bindProperty(
        hostDeps,
        host.user.id,
        propertyId,
        host.wallet.address,
      );
      const record = ports.inventory.seedNight({
        propertyId,
        roomTypeId,
        date,
      });
      record.state.F = 0.5;
      record.openedAt = 0;
      ports.inventory.save(record);
      await openChainNights(hostDeps, host.user.id, [
        { record, tenths: 100, preset: "calm", releasePolicy: 1, kept: false },
      ]);
      const config = (
        await reader.read<NightConfig>({
          contract: "NightFactory",
          functionName: "config",
          args: [night],
        })
      ).value;
      const checkIn = config.checkIn;
      const outside = createWalletClient({
        account: anvilAccount(0),
        chain: client.chain,
        transport: http(rpc),
      });
      const blacklist = async (address: Address, value: boolean) => {
        const hash = await outside.writeContract({
          address: d.USDC,
          abi: parseAbi(["function setBlacklisted(address,bool)"]),
          functionName: "setBlacklisted",
          args: [address, value],
        });
        await client.waitForTransactionReceipt({ hash });
      };
      const marketNight = toProto(record.key);
      const maker = required(users[1]);
      const taker = required(users[2]);
      await maker.clients.market.buy({
        night: marketNight,
        size: { tenths: 2 },
        maxTotal: { micros: 20_000_000n },
      });
      const prepared = await maker.clients.market.prepareAsk({
        night: marketNight,
        size: { tenths: 1 },
        price: { micros: 1n },
      });
      const askSignature = await custody.signTypedData(
        maker.wallet.walletId,
        JSON.parse(prepared.typedDataJson),
      );
      await maker.clients.market.postAsk({
        night: marketNight,
        size: { tenths: 1 },
        price: { micros: 1n },
        expiry: prepared.order?.expiry,
        nonce: prepared.order?.nonce,
        signature: askSignature,
      });
      const digest = required(
        askRows(
          { ports, repo: createSqliteMarketRepo(ports.db) },
          record.key,
        )[0],
      ).digest;
      await taker.clients.market.buy({
        night: marketNight,
        size: { tenths: 1 },
        maxTotal: { micros: 20_000_000n },
      });
      expect(
        (
          await reader.read<bigint>({
            contract: "TradeRouter",
            functionName: "filled",
            args: [digest],
          })
        ).value,
      ).toBe(10n ** 17n);
      await taker.clients.market.sell({
        night: marketNight,
        size: { tenths: 1 },
        minTotal: { micros: 0n },
      });
      await blacklist(host.wallet.address, true);
      for (const [i, buyer] of users.slice(1, 5).entries()) {
        await buyer.clients.market.buy({
          night: marketNight,
          size: { tenths: i === 0 ? 24 : 25 },
          maxTotal: { micros: 20_000_000n },
        });
      }
      expect(
        (
          await reader.read<bigint>({
            contract: "NightToken",
            night,
            functionName: "held",
          })
        ).value,
      ).toBe(10n ** 19n);
      expect(
        (
          await reader.read<bigint>({
            contract: "NightHook",
            functionName: "credits",
            args: [host.wallet.address],
          })
        ).value,
      ).toBeGreaterThan(0n);
      await blacklist(host.wallet.address, false);
      // Block every holder to exercise recall credits regardless of holder ordering.
      for (const holder of users.slice(1, 5))
        await blacklist(holder.wallet.address, true);
      const repo = createSqliteStayRepo(ports.db);
      let cases = createStayCases(ports, repo);
      const user = guest.user;
      const selection = create(StaySelectionSchema, {
        propertyId,
        roomTypeId,
        checkIn: date,
        checkOut: checkout,
        rooms: 1,
        adults: 1,
      });
      expect(() => cases.quoteStay({ ...selection, rooms: 2 })).toThrow(
        "1 room for 1 night",
      );
      const quote = create(StayQuoteSchema, {
        id: "chain-quote",
        selection,
        total: { micros: 20_000_000n },
      });
      repo.quotes.set(quote.id, quote);
      const lock = cases.lockQuote(quote.id, user.id);
      const request = create(CreateBookingRequestSchema, {
        lockId: lock.id,
        guestName: "Chain Guest",
        guestEmail: "chain@example.test",
      });
      const before = (await reader.cash(guest.wallet.address)).value.usdc;
      let crashed = false;
      ports.chainExecutor = createChainExecutor({
        db: ports.db,
        deployment: d,
        client,
        reader,
        custody,
        afterBroadcast: () => {
          // Approval operations are allowed to finish; interrupt the booking only.
          const sent = ports.db
            .query<{ command: string }, []>(
              "SELECT command FROM chain_operations ORDER BY rowid DESC LIMIT 1",
            )
            .get();
          if (!crashed && sent?.command.includes('"kind":"book"')) {
            crashed = true;
            throw new Error("Injected booking crash.");
          }
        },
      });
      await expect(cases.createBooking(request, user)).rejects.toThrow(
        "pending reconciliation",
      );
      expect(repo.trips.size).toBe(0);
      expect(repo.locks.get(lock.id)?.busy).toBe(true);
      ports.chainExecutor = executor;
      await expect(runChainJobs(ports)).rejects.toThrow(
        "Chain jobs require reconciliation",
      );
      const recallCredits = await Promise.all(
        users.slice(1, 5).map(
          async (holder) =>
            (
              await reader.read<bigint>({
                contract: "NightToken",
                night,
                functionName: "credits",
                args: [holder.wallet.address],
              })
            ).value,
        ),
      );
      expect(recallCredits.reduce((a, b) => a + b, 0n)).toBeGreaterThan(0n);
      for (const holder of users.slice(1, 5))
        await blacklist(holder.wallet.address, false);
      cases = createStayCases(ports, createSqliteStayRepo(ports.db));
      ports.channelManager.setPushFailure?.(true);
      const trip = await cases.createBooking(request, user);
      expect(trip.chainBookingId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(trip.hotelSyncPending).toBe(false);
      const paid = required(trip.total).micros;
      expect(
        before - (await reader.cash(guest.wallet.address)).value.usdc,
      ).toBe(paid);
      expect(
        (
          await reader.read<bigint>({
            contract: "NightToken",
            night,
            functionName: "burned",
          })
        ).value,
      ).toBe(10n ** 18n);
      expect(
        (
          await reader.read<bigint>({
            contract: "NightToken",
            night,
            functionName: "held",
          })
        ).value,
      ).toBe(9n * 10n ** 18n);
      expect(
        (
          await reader.read<bigint>({
            contract: "HumanRegistry",
            functionName: "humanIdOf",
            args: [guest.wallet.address],
          })
        ).value,
      ).toBe(0n);
      ports.channelManager.setPushFailure?.(false);
      const retry = await cases.createBooking(request, user);
      expect(retry.id).toBe(trip.id);
      expect(retry.hotelSyncPending).toBe(false);
      expect(
        before - (await reader.cash(guest.wallet.address)).value.usdc,
      ).toBe(paid);
      const externalHash = await outside.writeContract({
        address: d.NightVault,
        abi: d.abis.NightVault ?? [],
        functionName: "sweep",
        args: [night],
      });
      await client.waitForTransactionReceipt({ hash: externalHash });
      await runChainJobs(ports);
      expect(
        ports.db
          .query(
            "SELECT 1 FROM chain_events WHERE tx_hash = ? AND event = 'Swept'",
          )
          .get(externalHash),
      ).not.toBeNull();
      // Empty cover explicitly on this child fork so the entire refund becomes a FIFO claim.
      const coverBalance = (await reader.cash(d.CoverFund)).value.usdc;
      await rpcCall("anvil_impersonateAccount", [d.CoverFund]);
      await rpcCall("anvil_setBalance", [d.CoverFund, toHex(10n ** 21n)]);
      const coverSigner = createWalletClient({
        account: d.CoverFund,
        chain: client.chain,
        transport: http(rpc),
      });
      const emptied = await coverSigner.writeContract({
        address: d.USDC,
        abi: usdcAbi,
        functionName: "transfer",
        args: [host.wallet.address, coverBalance - 1000n],
      });
      await client.waitForTransactionReceipt({ hash: emptied });
      await rpcCall("anvil_stopImpersonatingAccount", [d.CoverFund]);
      await rpcCall("evm_setNextBlockTimestamp", [Number(checkIn)]);
      await rpcCall("evm_mine", []);
      (ports.clock as MockClock).set(Number(checkIn) * 1000);
      await expect(cases.reportWalk(trip.id, user)).rejects.toThrow(
        "Tap the reception tag",
      );
      cases.tapReception(
        trip.id,
        cases.issueReceptionTag(trip.id, user.id).tagPayload,
        user.id,
      );
      await blacklist(guest.wallet.address, true);
      const refund = await cases.reportWalk(trip.id, user);
      expect(refund.paidToGuest.micros + refund.owedToGuest.micros).toBe(paid);
      expect(refund.owedToGuest.micros).toBeGreaterThan(0n);
      const repeated = await cases.reportWalk(trip.id, user);
      expect(repeated.reportId).toBe(refund.reportId);
      expect(
        (
          await reader.read<bigint>({
            contract: "Settlement",
            functionName: "incidents",
            args: [host.wallet.address],
          })
        ).value,
      ).toBe(1n);
      const operation = ports.db
        .query<{ id: string }, []>(
          "SELECT id FROM chain_operations WHERE id LIKE 'walk:%'",
        )
        .get();
      const result = await executor.recover(required(operation).id);
      expect(receiptEvents(result, d, "Settlement", "WalkPaid")).toHaveLength(
        1,
      );
      expect(
        (
          await reader.read<bigint>({
            contract: "Settlement",
            functionName: "credits",
            args: [guest.wallet.address],
          })
        ).value,
      ).toBeGreaterThan(0n);
      await blacklist(guest.wallet.address, false);
      // A failed push advances the cursor but preserves the wallet's claim fallback.
      const blocked = required(users[3]);
      await blacklist(blocked.wallet.address, true);
      await runChainJobs(ports);
      expect(
        (
          await reader.read<boolean>({
            contract: "Settlement",
            functionName: "cutoffSettled",
            args: [night],
          })
        ).value,
      ).toBe(true);
      expect(
        (
          await reader.read<bigint>({
            contract: "Settlement",
            functionName: "claimable",
            args: [night, blocked.wallet.address],
          })
        ).value,
      ).toBeGreaterThan(0n);
      await blacklist(blocked.wallet.address, false);
      await blocked.clients.market.claimCutoff({ night: marketNight });
      expect(
        (
          await reader.read<bigint>({
            contract: "Settlement",
            functionName: "claimable",
            args: [night, blocked.wallet.address],
          })
        ).value,
      ).toBe(0n);
      expect(
        (
          await reader.read<bigint>({
            contract: "Settlement",
            functionName: "credits",
            args: [guest.wallet.address],
          })
        ).value,
      ).toBe(0n);
      expect(
        (
          await reader.read<bigint>({
            contract: "NightHook",
            functionName: "credits",
            args: [host.wallet.address],
          })
        ).value,
      ).toBe(0n);
      for (const holder of users.slice(1, 5))
        expect(
          (
            await reader.read<bigint>({
              contract: "NightToken",
              night,
              functionName: "credits",
              args: [holder.wallet.address],
            })
          ).value,
        ).toBe(0n);
      const finalCash = (await reader.cash(blocked.wallet.address)).value.usdc;
      await runChainJobs(ports);
      expect((await reader.cash(blocked.wallet.address)).value.usdc).toBe(
        finalCash,
      );
      // A new deployment identity quarantines old pending work and cannot replay it.
      const oldOperation = required(
        ports.db
          .query<{ id: string }, []>(
            "SELECT id FROM chain_operations WHERE command LIKE '%book%' LIMIT 1",
          )
          .get(),
      );
      ports.db
        .query("UPDATE chain_operations SET state = 'mined' WHERE id = ?")
        .run(oldOperation.id);
      const changedReader = createChainReader(
        ports.db,
        d,
        client,
        `${reader.fingerprint}-changed`,
      );
      const changedExecutor = createChainExecutor({
        db: ports.db,
        deployment: d,
        client,
        reader: changedReader,
        custody,
      });
      expect(
        ports.db
          .query<{ state: string }, [string]>(
            "SELECT state FROM chain_operations WHERE id = ?",
          )
          .get(oldOperation.id)?.state,
      ).toBe("needs_reconciliation");
      await expect(changedExecutor.recover(oldOperation.id)).rejects.toThrow(
        "Stale deployment operation rejected",
      );
      ports.chainReader = changedReader;
      ports.chainExecutor = changedExecutor;
      await expect(runChainJobs(ports)).rejects.toThrow(
        "Deployment fingerprint changed",
      );
      expect((await reader.cash(blocked.wallet.address)).value.usdc).toBe(
        finalCash,
      );
    } finally {
      await harness?.close();
      child.kill();
      await child.exited;
    }
  },
  300000,
);

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null)
    throw new Error("Missing test fixture value.");
  return value;
}
