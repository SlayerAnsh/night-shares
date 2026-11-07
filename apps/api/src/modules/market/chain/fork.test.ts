import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { create } from "@bufbuild/protobuf";
import {
  AgentOrderSchema,
  AgentOrderStatus,
} from "@night-shares/proto/market/v1/portfolio_pb";
import {
  createWalletClient,
  type Hex,
  http,
  keccak256,
  stringToHex,
  toHex,
} from "viem";
import {
  agentPassSettings,
  configureAgentPass,
} from "../../../ports/agent-pass/settings";
import { loadDeployment } from "../../../ports/arc-deployment/arc-deployment";
import { assertLocalForkRpc } from "../../../ports/arc-deployment/local-fork";
import {
  forkClient,
  validateDeployment,
} from "../../../ports/arc-deployment/validate";
import { ensureRouterAllowance } from "../../../ports/chain-executor/approvals";
import {
  type ChainCommand,
  deserialize,
} from "../../../ports/chain-executor/chain-executor";
import { createChainExecutor } from "../../../ports/chain-executor/chain-executor.viem";
import { createChainReader } from "../../../ports/chain-reader/chain-reader.viem";
import { forkProvisioner } from "../../../ports/wallet-custody/provision-fork";
import type { WalletCustody } from "../../../ports/wallet-custody/wallet-custody";
import {
  anvilAccount,
  createAnvilWalletCustody,
} from "../../../ports/wallet-custody/wallet-custody.anvil";
import { createForkWalletProvider } from "../../../ports/wallet-provider/wallet-provider.fork";
import { toProto } from "../../../shared/night-key";
import { agentWallets } from "../repo/agent-wallets.sqlite";
import { fixture } from "../testing/fixture";
import { approveAgentOrder } from "../use-cases/account/approve-agent-order";
import { createAgentOrder } from "../use-cases/account/create-agent-order";
import { postAskWithCustody } from "../use-cases/account/post-ask";
import { buyAgent } from "../use-cases/agent/buy";
import { completeAgentCheckpoint } from "../use-cases/agent/complete-checkpoint";
import { getAgentCheckpoint } from "../use-cases/agent/get-checkpoint";
import { startAgentCheckpoint } from "../use-cases/agent/start-checkpoint";
import { buy } from "../use-cases/trading/buy";
import { sell } from "../use-cases/trading/sell";
import { chainAgentTransfer, chainAgentWallet } from "./agent";
import { askRows, cancelChainAsks, liveAsks } from "./asks";
import { chainBook } from "./book";
import { claimChainCutoff, releaseChainCutoff } from "./cutoff";
import { chainPool } from "./pool";
import { chainPortfolio } from "./positions";
import { chainNight } from "./queries";
import { recoverChainMarket } from "./recovery";
import { configureChainMarket, nightHash } from "./runtime";
import { quoteChainTrade } from "./trading";

const forkTest = process.env.FORK_IT === "1" ? test : test.skip;
forkTest(
  "market fork: receipt trades, signed fill, nonce cancellation, agent sender and pending recovery",
  async () => {
    const upstream = process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545";
    assertLocalForkRpc(upstream);
    const deployment = loadDeployment("fork", process.env.ARC_DEPLOYMENT_FILE);
    if (!deployment) throw new Error("Deployment required.");
    const upstreamClient = forkClient(upstream);
    await validateDeployment(deployment, upstreamClient);
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test port.");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const rpcUrl = `http://127.0.0.1:${address.port}`;
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
    const deps = await fixture();
    const db = deps.ports.db;
    try {
      const client = forkClient(rpcUrl);
      for (let i = 0; i < 100; i++) {
        try {
          await client.getChainId();
          break;
        } catch {
          await Bun.sleep(100);
        }
      }
      const fingerprint = await validateDeployment(deployment, client);
      const reader = createChainReader(db, deployment, client, fingerprint);
      const base = createAnvilWalletCustody({
        db,
        network: "fork",
        deployment,
        rpcUrl,
      });
      // Isolated child fork plus a separate derivation range avoids parallel test identities.
      db.query("INSERT INTO anvil_wallets VALUES (?, ?, ?, ?)").run(
        "system:reserved",
        99001,
        "anvil:99001",
        anvilAccount(99001).address,
      );
      const attester = anvilAccount(9);
      const custody: WalletCustody = {
        ...base,
        async resolveWallet(id) {
          if (id === "chain:attester")
            return { walletId: id, address: attester.address };
          const w = await base.resolveWallet?.(id);
          if (!w) throw new Error("Missing wallet.");
          return w;
        },
        async signTransaction(id, tx) {
          if (id === "chain:attester") return attester.signTransaction(tx);
          const s = await base.signTransaction?.(id, tx);
          if (!s) throw new Error("Missing signer.");
          return s;
        },
      };
      let executor = createChainExecutor({
        db,
        deployment,
        client,
        reader,
        custody,
      });
      const provision = forkProvisioner({
        db,
        rpcUrl,
        client,
        reader,
        fingerprint,
        executor,
      });
      deps.ports.chainExecutor = executor;
      deps.ports.chainReader = reader;
      deps.ports.provisionWallet = provision;
      deps.ports.walletProvider = createForkWalletProvider(custody, reader);
      deps.ports.chainAttester = {
        address: attester.address,
        async sign(a) {
          if (a.kind !== "link" && a.kind !== "relink")
            throw new Error("Test only links.");
          return attester.signTypedData({
            domain: {
              name: "NightShares",
              version: "1",
              chainId: 5042,
              verifyingContract: deployment.HumanRegistry,
            },
            types: {
              LinkWallet: [
                { name: "humanId", type: "uint256" },
                { name: "wallet", type: "address" },
                { name: "deadline", type: "uint64" },
              ],
            },
            primaryType: "LinkWallet",
            message: {
              humanId: a.humanId,
              wallet: a.wallet,
              deadline: a.deadline,
            },
          });
        },
      };
      configureChainMarket(deps.ports, { custody, deployment, client });
      const key = "demo:double:2030-01-01";
      expect(nightHash(key)).toBe(deployment.demoNight as Hex);
      const record = {
        ...deps.ports.inventory.get(deps.key),
        key,
        propertyId: "demo",
        roomTypeId: "double",
        date: "2030-01-01",
      };
      const records = new Map([[key, record]]);
      deps.ports.inventory = {
        get: (k) => {
          const r = records.get(k);
          if (!r) throw new Error("Unknown test night.");
          return r;
        },
        list: () => [...records.values()],
        save: (r) => {
          records.set(r.key, r);
        },
        seedNight: () => record,
        update: (k, mutate) => {
          const r = records.get(k);
          if (!r) throw new Error("Unknown test night.");
          const next = mutate(r);
          records.set(k, next);
          return next;
        },
      };
      async function enroll(id: string, humanId: bigint) {
        const wallet = await custody.createWallet({
          kind: "user",
          humanId: id,
        });
        await provision(wallet);
        const deadline = (await reader.head()).timestamp + 3600n;
        const a = {
          kind: "link" as const,
          humanId,
          wallet: wallet.address,
          deadline,
        };
        const signature = await deps.ports.chainAttester?.sign(a);
        if (!signature) throw new Error("Missing test attester signature.");
        expect(
          (
            await executor.execute({
              operationId: `link:${id}`,
              walletId: wallet.walletId,
              command: { ...a, signature },
            })
          ).state,
        ).toBe("finalized");
        expect(
          (
            await executor.execute({
              operationId: `orb:${id}`,
              walletId: "chain:attester",
              command: { kind: "verifyHuman", humanId, orb: true },
            })
          ).state,
        ).toBe("finalized");
        return {
          user: {
            id,
            humanId: id,
            level: "orb" as const,
            walletAddress: wallet.address,
          },
          wallet,
        };
      }
      const maker = await enroll("market-maker", 60101n);
      const taker = await enroll("market-taker", 60102n);
      const journalBefore = db.query("SELECT * FROM chain_operations").all();
      const nonceBefore = await client.getTransactionCount({
        address: maker.wallet.address,
      });
      for (let i = 0; i < 3; i++) {
        expect(
          (await quoteChainTrade(deps, key, 2, maker.user, "buy")).total
            ?.micros,
        ).toBeGreaterThan(0n);
      }
      expect(db.query("SELECT * FROM chain_operations").all()).toEqual(
        journalBefore,
      );
      expect(
        await client.getTransactionCount({ address: maker.wallet.address }),
      ).toBe(nonceBefore);
      expect(
        db.query("SELECT * FROM market_chain_preparations").all(),
      ).toHaveLength(0);
      const before = (await reader.cash(maker.wallet.address)).value.usdc;
      const execution = await buy(
        deps,
        maker.user,
        key,
        2,
        1000000n,
        "receipt-replay",
      );
      expect(
        (await buy(deps, maker.user, key, 2, 1000000n, "receipt-replay"))
          .transactionHash,
      ).toBe(execution.transactionHash);
      expect((await reader.cash(maker.wallet.address)).value.usdc).toBe(
        before - (execution.quote?.total?.micros ?? 0n),
      );
      expect(execution.transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      const tradeReceipt = await client.getTransactionReceipt({
        hash: execution.transactionHash as Hex,
      });
      expect(tradeReceipt.transactionHash).toBe(
        execution.transactionHash as Hex,
      );
      expect(tradeReceipt.to?.toLowerCase()).toBe(
        deployment.TradeRouter.toLowerCase(),
      );
      expect(execution.explorerUrl).toBe("");
      const paid = execution.quote?.total?.micros ?? 0n;
      for (const row of db
        .query<{ command: string }, []>("SELECT command FROM chain_operations")
        .all()) {
        const command = deserialize<ChainCommand>(row.command);
        // The router call is bounded by the quote plus 0.5%, not the caller cap.
        if (command.kind === "buy" && command.maxPaid !== 0n)
          expect(command.maxPaid).toBeLessThanOrEqual(
            paid + (paid * 50n + 9999n) / 10000n + 1n,
          );
      }
      for (const row of db
        .query<{ command: string }, []>(
          "SELECT command FROM chain_operations WHERE id LIKE '%approve%'",
        )
        .all()) {
        const command = deserialize<ChainCommand>(row.command);
        if (command.kind === "approveUsdc" || command.kind === "approvePermit2")
          expect(command.amount).toBe(1000000n);
      }
      const pool = await chainPool(deps.ports, key);
      expect(pool.spot).toBeGreaterThan(0n);
      expect(pool.asks.length).toBeGreaterThan(0);
      expect(pool.bids.length).toBeGreaterThan(0);
      expect(pool.bids[0]?.net?.micros).toBeLessThan(
        pool.bids[0]?.price.micros ?? 0n,
      );
      expect(pool.refund).toBeGreaterThan(0n);
      const book = await chainBook(deps, key);
      expect(book.asks[0]?.source).toBe(1);
      const detail = await chainNight(deps, key);
      expect(detail.night.price?.micros).toBe(pool.spot);
      expect(detail.night.fairPrice).toBeUndefined();
      expect(detail.stats.expectedExit).toBeUndefined();
      expect(detail.night.estimatedReturnBps).toBe(0);
      expect(detail.stats.buyLiquidity?.tenths).toBe(pool.asks.length);
      expect(detail.stats.sellLiquidity?.tenths).toBe(pool.bids.length);
      expect(detail.stats.worstRefund?.micros).toBe(pool.refund);
      const preview = await quoteChainTrade(deps, key, 1, maker.user, "buy");
      expect(preview.capUsed?.tenths).toBe(2);
      expect(preview.cap?.tenths).toBe(
        Math.max(10, Math.floor((Number(pool.config.S) / 1e18) * 3)),
      );
      expect(preview.unsoldRefund?.micros).toBe((pool.refund ?? 0n) / 10n);
      const sellPreview = await quoteChainTrade(
        deps,
        key,
        1,
        maker.user,
        "sell",
      );
      expect(
        Math.abs(
          Number(
            (sellPreview.total?.micros ?? 0n) * 10n -
              (pool.bids[0]?.net?.micros ?? 0n),
          ),
        ),
      ).toBeLessThanOrEqual(20);
      const posted = await postAskWithCustody(deps, maker.user, key, 1, 1n, {
        signature: "",
        operationId: "post-retry",
      });
      const signedBook = await chainBook(deps, key);
      expect(signedBook.asks[0]?.price.micros).toBe(1n);
      expect(signedBook.asks[0]?.source).toBe(2);
      expect(await chainPool(deps.ports, key)).toBe(
        await chainPool(deps.ports, key),
      );
      const journalBeforeRetry = db
        .query("SELECT * FROM chain_operations")
        .all();
      expect(
        await postAskWithCustody(deps, maker.user, key, 1, 1n, {
          signature: "",
          operationId: "post-retry",
        }),
      ).toEqual(posted);
      expect(db.query("SELECT * FROM chain_operations").all()).toEqual(
        journalBeforeRetry,
      );
      await expect(
        postAskWithCustody(deps, maker.user, key, 1, 2n, {
          signature: "",
          operationId: "post-retry",
        }),
      ).rejects.toThrow("Idempotency key");
      const digest = askRows(deps, key)[0]?.digest;
      if (!digest) throw new Error("Missing ask digest.");
      await buy(deps, taker.user, key, 1, 1000000n);
      expect(
        (
          await reader.read<bigint>({
            contract: "TradeRouter",
            functionName: "filled",
            args: [digest],
          })
        ).value,
      ).toBe(100000000000000000n);
      const sellJournal = db.query("SELECT * FROM chain_operations").all();
      const sellNonce = await client.getTransactionCount({
        address: taker.wallet.address,
      });
      for (let i = 0; i < 3; i++)
        expect(
          (await quoteChainTrade(deps, key, 1, taker.user, "sell")).total
            ?.micros,
        ).toBeGreaterThan(0n);
      expect(db.query("SELECT * FROM chain_operations").all()).toEqual(
        sellJournal,
      );
      expect(
        await client.getTransactionCount({ address: taker.wallet.address }),
      ).toBe(sellNonce);
      const sold = await sell(deps, taker.user, key, 1, 0n);
      const tokenApproval = db
        .query<{ command: string }, [string]>(
          "SELECT command FROM chain_operations WHERE id = ?",
        )
        .get(`${sold.id}:approve-token`);
      if (!tokenApproval) throw new Error("Missing bounded token approval.");
      expect(deserialize<ChainCommand>(tokenApproval.command)).toEqual({
        kind: "approveToken",
        night: nightHash(key),
        amount: 100000000000000000n,
      });
      await postAskWithCustody(deps, maker.user, key, 1, 2n);
      const old = (await liveAsks(deps, key))[0];
      if (!old) throw new Error("Missing signed ask.");
      const secondKey = "market-test:double:2030-01-02";
      const secondNight = nightHash(secondKey);
      const property = keccak256(stringToHex("market-test"));
      const deadline = (await reader.head()).timestamp + 3600n;
      const signature = await attester.signTypedData({
        domain: {
          name: "NightShares",
          version: "1",
          chainId: 5042,
          verifyingContract: deployment.NightFactory,
        },
        types: {
          BindProperty: [
            { name: "property", type: "bytes32" },
            { name: "hostPayout", type: "address" },
            { name: "deadline", type: "uint64" },
          ],
        },
        primaryType: "BindProperty",
        message: { property, hostPayout: maker.wallet.address, deadline },
      });
      expect(
        (
          await executor.execute({
            operationId: "bind-test",
            walletId: maker.wallet.walletId,
            command: {
              kind: "bind",
              property,
              hostPayout: maker.wallet.address,
              deadline,
              signature,
            },
          })
        ).state,
      ).toBe("finalized");
      const checkIn = BigInt(Date.parse("2030-01-02T15:00:00Z") / 1000);
      const config = {
        F: 500000n,
        k: 1200000000000000000n,
        S: 10000000000000000000n,
        X: 0n,
        cutoff: checkIn - 3600n,
        host: maker.wallet.address,
        property,
        roomType: keccak256(stringToHex("double")),
        night: secondNight,
        checkIn,
      };
      let salt = toHex(0, { size: 32 });
      for (let i = 0; i < 1000; i++) {
        salt = toHex(i, { size: 32 });
        const predicted = (
          await reader.read<Hex>({
            contract: "NightFactory",
            functionName: "predictToken",
            args: [config, salt],
          })
        ).value;
        if (BigInt(predicted) < BigInt(deployment.USDC)) break;
      }
      expect(
        (
          await executor.execute({
            operationId: "open-test",
            walletId: maker.wallet.walletId,
            command: {
              kind: "open",
              propertyId: "market-test",
              roomTypeId: "double",
              date: "2030-01-02",
              config,
              salt,
            },
          })
        ).state,
      ).toBe("finalized");
      expect(
        (
          await executor.execute({
            operationId: "chunk-test",
            walletId: maker.wallet.walletId,
            command: {
              kind: "addChunk",
              night: secondNight,
              fromRoom: 0n,
              toRoom: 10n,
            },
          })
        ).state,
      ).toBe("finalized");
      records.set(secondKey, {
        ...record,
        key: secondKey,
        propertyId: "market-test",
        date: "2030-01-02",
      });
      await buy(deps, maker.user, secondKey, 1, 1000000n);
      await postAskWithCustody(deps, maker.user, secondKey, 1, 100n);
      const kept = (await liveAsks(deps, secondKey))[0];
      if (!kept) throw new Error("Missing keep ask.");
      const cancellation = await cancelChainAsks(
        deps,
        maker.user,
        `${key}|${maker.wallet.address}`,
      );
      expect(cancellation.transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(cancellation.resignedAskIds).toEqual([
        `${secondKey}|${maker.wallet.address}`,
      ]);
      expect(
        (
          await reader.read<bigint>({
            contract: "TradeRouter",
            functionName: "nonces",
            args: [maker.wallet.address],
          })
        ).value,
      ).toBeGreaterThan(old.order.nonce);
      expect(await liveAsks(deps, key)).toHaveLength(0);
      const resigned = (await liveAsks(deps, secondKey))[0];
      expect(resigned?.order.nonce).toBe(old.order.nonce + 1n);
      expect(resigned?.signature).not.toBe(kept.signature);
      await expect(
        reader.simulate(
          {
            kind: "buy",
            night: secondNight,
            qty: kept.qty,
            maxPaid: 1000000n,
            asks: [kept],
            hints: [],
            deadline: (await reader.head()).timestamp + 300n,
          },
          taker.wallet.address,
        ),
      ).rejects.toThrow();
      await cancelChainAsks(deps, maker.user);
      expect(await liveAsks(deps, secondKey)).toHaveLength(0);
      agentWallets(db).set(maker.user, 10000000n, 10000000n, []);
      const agent = await chainAgentWallet(deps, maker.user);
      await chainAgentTransfer(deps, maker.user, 1000000n, false);
      const agentBefore = (await reader.cash(agent.address)).value.usdc;
      executor = createChainExecutor({
        db,
        deployment,
        client,
        reader,
        custody,
        afterBroadcast: () => {
          throw new Error("Injected receipt interruption.");
        },
      });
      // Explicit fixture approvals isolate the injected failure to the trade transaction.
      async function approveAgentFixture(operationId: string) {
        if (!deployment) throw new Error("Missing deployment.");
        if (!deps.ports.chainExecutor) throw new Error("Missing executor.");
        await ensureRouterAllowance({
          reader,
          executor: deps.ports.chainExecutor,
          deployment,
          operationId,
          walletId: agent.walletId,
          owner: agent.address,
          router: "TradeRouter",
          amount: 1000000n,
          expiration: Number(
            ((await reader.head()).timestamp / 3600n + 3n) * 3600n,
          ),
        });
      }
      await approveAgentFixture("fixture-restart");
      deps.ports.chainExecutor = executor;
      await expect(
        buyAgent(deps, maker.user, key, 1, 1000000n, "agent-order:restart"),
      ).rejects.toThrow("pending reconciliation");
      deps.ports.chainExecutor = createChainExecutor({
        db,
        deployment,
        client,
        reader,
        custody,
      });
      await recoverChainMarket(deps);
      const recovered = await buyAgent(
        deps,
        maker.user,
        key,
        1,
        1000000n,
        "agent-order:restart",
      );
      const replayed = await buyAgent(
        deps,
        maker.user,
        key,
        1,
        1000000n,
        "agent-order:restart",
      );
      expect(replayed.id).toBe(recovered.id);
      if (!recovered.quote?.total) throw new Error("Missing recovered total.");
      expect((await reader.cash(agent.address)).value.usdc).toBe(
        agentBefore - recovered.quote.total.micros,
      );
      expect(agentWallets(db).get(maker.user).spent).toBe(
        recovered.quote.total.micros,
      );
      const portfolio = await chainPortfolio(deps, maker.user);
      expect(
        portfolio.holdings.find((h) => h.night?.propertyId === "demo")?.size
          ?.tenths,
      ).toBe(2);
      expect(
        db
          .query<{ n: bigint }, []>(
            "SELECT COUNT(*) n FROM chain_operations WHERE id = 'agent-order:restart'",
          )
          .get()?.n,
      ).toBe(1n);
      const spentBeforeRevert = agentWallets(db).get(maker.user).spent;
      const executorBeforeRevert = deps.ports.chainExecutor;
      deps.ports.chainExecutor = {
        ...executorBeforeRevert,
        async execute(request) {
          if (request.command.kind === "buy")
            return executorBeforeRevert.execute({
              ...request,
              command: { ...request.command, maxPaid: 0n },
            });
          return executorBeforeRevert.execute(request);
        },
      };
      await expect(
        buyAgent(deps, maker.user, key, 1, 1000000n, "agent-order:revert"),
      ).rejects.toThrow();
      expect(agentWallets(db).get(maker.user).spent).toBe(spentBeforeRevert);
      expect(
        db
          .query<{ state: string }, []>(
            "SELECT state FROM market_chain_intents WHERE id = 'agent-order:revert'",
          )
          .get()?.state,
      ).toBe("reverted");
      deps.ports.chainExecutor = executorBeforeRevert;
      const directOrder = await createAgentOrder(
        deps,
        maker.user,
        key,
        1,
        1000000n,
      );
      expect(directOrder.order.status).toBe(AgentOrderStatus.EXECUTED);
      configureAgentPass(deps.ports, { agentApproval: "idkit" });
      const approvedOrder = create(AgentOrderSchema, {
        night: directOrder.order.night,
        size: directOrder.order.size,
        budget: directOrder.order.budget,
        walletAddress: directOrder.order.walletAddress,
        id: "idkit-chain",
        status: AgentOrderStatus.PENDING,
        spent: { micros: 0n },
        requiresVerification: true,
      });
      deps.repo
        .account(maker.user.humanId)
        .orders.set(approvedOrder.id, approvedOrder);
      const approval = deps.ports.verifications.issue({
        userId: maker.user.id,
        action: "approve_agent_order",
        resourceId: approvedOrder.id,
      });
      expect(
        (
          await approveAgentOrder(
            deps,
            maker.user,
            approvedOrder.id,
            approval.token,
          )
        ).order.status,
      ).toBe(AgentOrderStatus.EXECUTED);
      configureAgentPass(deps.ports, { agentApproval: "agent-pass" });
      // Exercise the approved checkpoint boundary, then restart the executor before polling.
      const settings = agentPassSettings(deps.ports);
      const order = create(AgentOrderSchema, {
        id: "checkpoint-chain",
        night: toProto(key),
        size: { tenths: 1 },
        budget: { micros: 1000000n },
        walletAddress: agent.address,
        status: AgentOrderStatus.PENDING,
        requiresVerification: true,
      });
      deps.repo.account(maker.user.humanId).orders.set(order.id, order);
      settings.store.enroll(
        maker.user.id,
        settings.config.agentPassIssuer,
        `mock:${maker.user.id}`,
      );
      const session = deps.ports.sessions.create(maker.user);
      const started = await startAgentCheckpoint(
        deps,
        maker.user,
        order.id,
        session,
      );
      const attempt = settings.store.get(started.attemptId ?? "");
      if (!attempt) throw new Error("Missing checkpoint.");
      attempt.browser = "chain-browser";
      settings.store.save(attempt);
      await approveAgentFixture("fixture-checkpoint");
      deps.ports.chainExecutor = createChainExecutor({
        db,
        deployment,
        client,
        reader,
        custody,
        afterBroadcast: () => {
          throw new Error("Interrupted checkpoint receipt.");
        },
      });
      expect(
        await completeAgentCheckpoint(deps, {
          state: attempt.state,
          browser: "chain-browser",
          code: "approve",
        }),
      ).toBe("approved");
      expect(settings.store.get(attempt.id)?.reason).toBe("execution_pending");
      deps.ports.chainExecutor = createChainExecutor({
        db,
        deployment,
        client,
        reader,
        custody,
      });
      expect(
        (await getAgentCheckpoint(deps, maker.user, attempt.id)).status,
      ).toBe("used");
      expect(
        deps.repo.account(maker.user.humanId).orders.get(order.id)?.status,
      ).toBe(AgentOrderStatus.EXECUTED);
      expect(
        await completeAgentCheckpoint(deps, {
          state: attempt.state,
          browser: "chain-browser",
          code: "approve",
        }),
      ).toBe("mismatch");
      // External token transfer must appear without an API settlement mutation.
      const token = await reader.tokenOf(nightHash(key));
      const external = createWalletClient({
        account: anvilAccount(99002),
        transport: http(rpcUrl),
      });
      const hash = await external.writeContract({
        chain: null,
        address: token,
        abi: deployment.abis.NightToken ?? [],
        functionName: "transfer",
        args: [taker.wallet.address, 100000000000000000n],
      });
      await client.waitForTransactionReceipt({ hash });
      const afterExternal = await chainPortfolio(deps, taker.user);
      expect(
        afterExternal.holdings.find((h) => h.night?.propertyId === "demo")?.size
          ?.tenths,
      ).toBe(1);
      // Time moves only on the disposable child. Claims execute from each holder wallet.
      await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "evm_setNextBlockTimestamp",
          params: [Number(config.cutoff) + 1],
        }),
      });
      await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "evm_mine",
          params: [],
        }),
      });
      await releaseChainCutoff(deps);
      const claimsBefore = (
        await reader.read<bigint>({
          contract: "Settlement",
          functionName: "claimable",
          args: [nightHash(key), agent.address],
        })
      ).value;
      expect(claimsBefore).toBeGreaterThan(0n);
      const claim = await claimChainCutoff(deps, maker.user, key);
      expect(claim.claim.amount?.micros).toBe(claimsBefore);
      expect(
        (
          await reader.read<boolean>({
            contract: "Settlement",
            functionName: "claimed",
            args: [nightHash(key), agent.address],
          })
        ).value,
      ).toBe(true);
      expect(
        (
          await reader.read<boolean>({
            contract: "Settlement",
            functionName: "claimed",
            args: [nightHash(key), taker.wallet.address],
          })
        ).value,
      ).toBe(false);
    } finally {
      db.close();
      child.kill();
      await child.exited;
    }
  },
  120000,
);
