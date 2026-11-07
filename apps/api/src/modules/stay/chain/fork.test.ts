import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { create } from "@bufbuild/protobuf";
import { CreateBookingRequestSchema } from "@night-shares/proto/stay/v1/stay_pb";
import {
  StayQuoteSchema,
  StaySelectionSchema,
} from "@night-shares/proto/stay/v1/trip_pb";
import {
  createWalletClient,
  type Hex,
  http,
  keccak256,
  stringToHex,
  toHex,
} from "viem";
import { buildContainer } from "../../../container/build-container";
import { loadDeployment } from "../../../ports/arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../../../ports/arc-deployment/local-fork";
import {
  forkClient,
  validateDeployment,
} from "../../../ports/arc-deployment/validate";
import { createChainAttester } from "../../../ports/chain-attester/chain-attester";
import { ensureRouterAllowance } from "../../../ports/chain-executor/approvals";
import type {
  ChainCommand,
  NightConfig,
} from "../../../ports/chain-executor/chain-executor";
import { createChainExecutor } from "../../../ports/chain-executor/chain-executor.viem";
import { usdcAbi } from "../../../ports/chain-executor/codecs";
import { createChainReader } from "../../../ports/chain-reader/chain-reader.viem";
import type { MockClock } from "../../../ports/clock/clock.mock";
import type {
  CustodyWallet,
  WalletCustody,
} from "../../../ports/wallet-custody/wallet-custody";
import {
  anvilAccount,
  createAnvilWalletCustody,
} from "../../../ports/wallet-custody/wallet-custody.anvil";
import { createForkWalletProvider } from "../../../ports/wallet-provider/wallet-provider.fork";
import { createSqliteStayRepo } from "../repo/stay-repo.sqlite";
import { createStayCases } from "../use-cases/create-stay-cases";
import { confirmed, receiptEvents } from "./context";

const forkTest = process.env.FORK_IT === "1" ? test : test.skip;
forkTest(
  "fork: custody recall booking, receipt recovery, PMS retry, exact walk and short-cover claim",
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
    const { ports } = buildContainer({
      port: 0,
      adapters: "mock",
      dbPath: ":memory:",
      devTagIssuer: true,
    });
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
      const firstIndex = 60001 + Math.floor(Math.random() * 10000);
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
      const deadline = (await reader.head()).timestamp + 86400n;
      const users: { wallet: CustodyWallet; id: bigint }[] = [];
      for (let i = 0; i < 6; i++) {
        const id = BigInt(firstIndex * 10 + i + 1);
        const wallet = await custody.createWallet({
          kind: "user",
          humanId: String(id),
        });
        await rpcCall("anvil_setBalance", [wallet.address, toHex(10n ** 21n)]);
        await execute(wallet.walletId, {
          kind: "provisionToken",
          to: wallet.address,
          amount: 100_000_000n,
        });
        if (i < 5) {
          const signature = await signing.attester.sign({
            kind: "link",
            humanId: id,
            wallet: wallet.address,
            deadline,
          });
          await execute(wallet.walletId, {
            kind: "link",
            humanId: id,
            wallet: wallet.address,
            deadline,
            signature,
          });
          await execute("fork:attester", {
            kind: "verifyHuman",
            humanId: id,
            orb: true,
          });
        }
        users.push({ wallet, id });
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
      const property = keccak256(stringToHex(propertyId));
      const night = keccak256(
        stringToHex(`${propertyId}:${roomTypeId}:${date}`),
      );
      const signature = await signing.attester.sign({
        kind: "bind",
        property,
        hostPayout: host.wallet.address,
        deadline,
      });
      await execute(host.wallet.walletId, {
        kind: "bind",
        property,
        hostPayout: host.wallet.address,
        deadline,
        signature,
      });
      const checkIn = BigInt(Date.parse(`${date}T15:00:00Z`) / 1000);
      const config: NightConfig = {
        F: 500000n,
        k: 1200000000000000000n,
        S: 10n ** 19n,
        X: 0n,
        cutoff: checkIn - 3600n,
        host: host.wallet.address,
        property,
        roomType: keccak256(stringToHex(roomTypeId)),
        night,
        checkIn,
      };
      let salt = toHex(0n, { size: 32 });
      for (let i = 0n; ; i++) {
        salt = toHex(i, { size: 32 });
        const predicted = (
          await reader.read<Hex>({
            contract: "NightFactory",
            functionName: "predictToken",
            args: [config, salt],
          })
        ).value;
        if (BigInt(predicted) < BigInt(d.USDC)) break;
      }
      await execute(host.wallet.walletId, {
        kind: "open",
        propertyId,
        roomTypeId,
        date,
        config,
        salt,
      });
      await execute(host.wallet.walletId, {
        kind: "addChunk",
        night,
        fromRoom: 0n,
        toRoom: 10n,
      });
      for (const buyer of users.slice(1, 5)) {
        for (const approval of await ensureRouterAllowance({
          executor,
          reader,
          deployment: d,
          operationId: `buyer:${buyer.id}`,
          walletId: buyer.wallet.walletId,
          owner: buyer.wallet.address,
          router: "TradeRouter",
          amount: 20_000_000n,
          expiration: Number(deadline),
        }))
          confirmed(approval);
        await execute(buyer.wallet.walletId, {
          kind: "buy",
          night,
          qty: 25n * 10n ** 17n,
          maxPaid: 20_000_000n,
          asks: [],
          hints: [],
          deadline,
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
      const repo = createSqliteStayRepo(ports.db);
      let cases = createStayCases(ports, repo);
      const user = {
        id: "chain-guest",
        humanId: String(guest.id),
        level: "device" as const,
        walletAddress: guest.wallet.address,
      };
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
      const quoteJournal = ports.db
        .query("SELECT * FROM chain_operations")
        .all();
      const quoteNonce = await client.getTransactionCount({
        address: guest.wallet.address,
      });
      for (let i = 0; i < 3; i++) cases.quoteStay(selection);
      expect(ports.db.query("SELECT * FROM chain_operations").all()).toEqual(
        quoteJournal,
      );
      expect(
        await client.getTransactionCount({ address: guest.wallet.address }),
      ).toBe(quoteNonce);
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
      cases = createStayCases(ports, createSqliteStayRepo(ports.db));
      ports.channelManager.setPushFailure?.(true);
      const trip = await cases.createBooking(request, user);
      expect(trip.chainBookingId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(trip.hotelSyncPending).toBe(true);
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
      await execute(host.wallet.walletId, { kind: "sweep", night });
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
        args: [host.wallet.address, coverBalance],
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
      const cashBeforeReport = (await reader.cash(guest.wallet.address)).value
        .usdc;
      ports.chainAttester = {
        address: signing.attester.address,
        async sign(attestation) {
          const signature = await signing.attester.sign(attestation);
          if (attestation.kind === "walk") {
            await rpcCall("evm_setNextBlockTimestamp", [
              Number(attestation.report.deadline + 1n),
            ]);
            await rpcCall("evm_mine", []);
          }
          return signature;
        },
      };
      await expect(cases.reportWalk(trip.id, user)).rejects.toThrow("Expired");
      expect(ports.db.query("SELECT 1 FROM walk_reports").get()).toBeNull();
      expect((await reader.cash(guest.wallet.address)).value.usdc).toBe(
        cashBeforeReport,
      );
      (ports.clock as MockClock).set(
        Number((await reader.head()).timestamp) * 1000,
      );
      ports.chainAttester = {
        address: signing.attester.address,
        sign: (attestation) =>
          signing.attester.sign(
            attestation.kind === "walk"
              ? {
                  kind: "walk",
                  report: {
                    ...attestation.report,
                    paid: attestation.report.paid + 1n,
                  },
                }
              : attestation,
          ),
      };
      await expect(cases.reportWalk(trip.id, user)).rejects.toThrow(
        "InvalidSignature",
      );
      expect(ports.db.query("SELECT 1 FROM walk_reports").get()).toBeNull();
      expect((await reader.cash(guest.wallet.address)).value.usdc).toBe(
        cashBeforeReport,
      );
      ports.chainAttester = signing.attester;
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
    } finally {
      ports.db.close();
      child.kill();
      await child.exited;
    }
  },
  180000,
);

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null)
    throw new Error("Missing test fixture value.");
  return value;
}
