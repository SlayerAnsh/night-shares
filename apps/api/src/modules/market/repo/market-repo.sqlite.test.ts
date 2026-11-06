import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { buildContainer } from "../../../container/build-container";
import { fixture } from "../testing/fixture";
import { approveAgentOrder } from "../use-cases/account/approve-agent-order";
import { cancelAsk } from "../use-cases/account/cancel-ask";
import { createAgentOrder } from "../use-cases/account/create-agent-order";
import { getPortfolio } from "../use-cases/account/get-portfolio";
import { postAsk } from "../use-cases/account/post-ask";
import { toggleWatch } from "../use-cases/account/toggle-watch";
import { buy } from "../use-cases/trading/buy";
import { sell } from "../use-cases/trading/sell";
import { createSqliteMarketRepo } from "./market-repo.sqlite";

async function sqliteFixture() {
  const d = await fixture();
  return { ...d, repo: createSqliteMarketRepo(d.ports.db) };
}

test("market positions, listings, watchlist and agent orders survive restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "night-shares-market-"));
  const config = {
    port: 0,
    adapters: "mock" as const,
    today: "2026-12-01",
    dbPath: join(directory, "market.db"),
    ids: "random" as const,
  };
  let { ports } = buildContainer(config);
  try {
    let deps = { ports, repo: createSqliteMarketRepo(ports.db) };
    const user = {
      id: "usr_restart",
      humanId: "restart",
      level: "orb" as const,
      walletAddress: await ports.walletProvider.linkWallet("restart"),
    };
    const key = "prop_velana:rt_velana_0:2026-12-01";
    await buy(deps, user, key, 5, 10n ** 12n);
    await sell(deps, user, key, 1, 0n);
    postAsk(deps, user, key, 2, 500000000n);
    toggleWatch(deps, user, key);
    const pending = await createAgentOrder(
      deps,
      user,
      "prop_velana:rt_velana_0:2026-12-20",
      5,
      10000000000n,
    );
    const executed = await createAgentOrder(deps, user, key, 1, 1000000000n);
    const portfolio = getPortfolio(deps, user);
    const position = { ...deps.repo.position(user.humanId, key) };
    const inventory = ports.inventory.get(key);
    ports.db.close();
    ({ ports } = buildContainer(config));
    deps = { ports, repo: createSqliteMarketRepo(ports.db) };
    expect(getPortfolio(deps, user)).toEqual(portfolio);
    expect(deps.repo.position(user.humanId, key)).toEqual(position);
    expect([...deps.repo.account(user.humanId).watch]).toEqual([key]);
    expect(ports.inventory.get(key)).toEqual(inventory);
    expect(
      deps.repo.account(user.humanId).orders.get(executed.order.id)?.status,
    ).toBe(AgentOrderStatus.EXECUTED);
    const token = ports.verifications.issue({
      userId: user.id,
      action: "approve_agent_order",
    }).token;
    await approveAgentOrder(deps, user, pending.order.id, token);
    cancelAsk(deps, user, `${key}|${user.walletAddress}`);
    toggleWatch(deps, user, key);
    ports.db.close();
    ({ ports } = buildContainer(config));
    deps = { ports, repo: createSqliteMarketRepo(ports.db) };
    expect(
      deps.repo.account(user.humanId).orders.get(pending.order.id)?.status,
    ).toBe(AgentOrderStatus.EXECUTED);
    await expect(
      approveAgentOrder(deps, user, pending.order.id, token),
    ).rejects.toThrow("already executed");
    expect([...deps.repo.account(user.humanId).watch]).toEqual([]);
    expect(getPortfolio(deps, user).listings).toEqual([]);
  } finally {
    ports.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("position money retains bigint precision and signed realised P&L", async () => {
  const d = await sqliteFixture();
  try {
    const position = d.repo.position(d.user.humanId, d.key);
    position.average = 9007199254740993n;
    position.realised = -9007199254740993n;
    position.askPrice = 9007199254740995n;
    const restored = createSqliteMarketRepo(d.ports.db).position(
      d.user.humanId,
      d.key,
    );
    expect({ ...restored }).toEqual({ ...position });
    expect(restored.average).toBe(9007199254740993n);
    expect(restored.realised).toBe(-9007199254740993n);
    expect(restored.askPrice).toBe(9007199254740995n);
  } finally {
    d.ports.db.close();
  }
});

test("failed position writes roll back inventory reservations and ask changes", async () => {
  const d = await sqliteFixture();
  try {
    await buy(d, d.user, d.key, 5, 10n ** 12n);
    const before = d.ports.inventory.get(d.key);
    const position = { ...d.repo.position(d.user.humanId, d.key) };
    d.ports.db.exec(
      "CREATE TRIGGER reject_position BEFORE UPDATE OF free ON market_positions BEGIN SELECT RAISE(ABORT, 'reject position'); END",
    );
    await expect(buy(d, d.user, d.key, 1, 10n ** 12n)).rejects.toThrow(
      "reject position",
    );
    await expect(sell(d, d.user, d.key, 1, 0n)).rejects.toThrow(
      "reject position",
    );
    expect(() => postAsk(d, d.user, d.key, 2, 500000000n)).toThrow(
      "reject position",
    );
    expect(d.ports.inventory.get(d.key)).toEqual(before);
    expect(d.repo.position(d.user.humanId, d.key)).toEqual(position);
    d.ports.db.exec("DROP TRIGGER reject_position");
    postAsk(d, d.user, d.key, 2, 500000000n);
    const listed = d.ports.inventory.get(d.key);
    const escrowed = { ...d.repo.position(d.user.humanId, d.key) };
    d.ports.db.exec(
      "CREATE TRIGGER reject_cancel BEFORE UPDATE OF free ON market_positions BEGIN SELECT RAISE(ABORT, 'reject cancel'); END",
    );
    expect(() =>
      cancelAsk(d, d.user, `${d.key}|${d.user.walletAddress}`),
    ).toThrow("reject cancel");
    expect(d.ports.inventory.get(d.key)).toEqual(listed);
    expect(d.repo.position(d.user.humanId, d.key)).toEqual(escrowed);
  } finally {
    d.ports.db.close();
  }
});

test("failed settlement restores SQLite inventory, cost and closed trade statistics", async () => {
  const d = await sqliteFixture();
  try {
    await buy(d, d.user, d.key, 5, 10n ** 12n);
    const before = d.ports.inventory.get(d.key);
    const position = { ...d.repo.position(d.user.humanId, d.key) };
    d.ports.walletProvider.settle = async () => {
      throw new Error("settlement failed");
    };
    await expect(buy(d, d.user, d.key, 1, 10n ** 12n)).rejects.toThrow(
      "settlement failed",
    );
    expect(d.ports.inventory.get(d.key)).toEqual(before);
    expect(d.repo.position(d.user.humanId, d.key)).toEqual(position);
    await expect(sell(d, d.user, d.key, 1, 0n)).rejects.toThrow(
      "settlement failed",
    );
    expect(d.ports.inventory.get(d.key)).toEqual(before);
    expect(d.repo.position(d.user.humanId, d.key)).toEqual(position);
  } finally {
    d.ports.db.close();
  }
});

test("retained account collections observe writes and rollback", async () => {
  const d = await sqliteFixture();
  try {
    const account = d.repo.account(d.user.humanId);
    d.repo.position(d.user.humanId, d.key).free = 3;
    expect(account.positions.get(d.key)?.free).toBe(3);
    toggleWatch(d, d.user, d.key);
    expect(account.watch.has(d.key)).toBe(true);
    expect(() =>
      d.ports.db
        .transaction(() => {
          account.watch.clear();
          account.positions.clear();
          throw new Error("rollback");
        })
        .immediate(),
    ).toThrow("rollback");
    expect([...account.watch]).toEqual([d.key]);
    expect(account.positions.get(d.key)?.free).toBe(3);
  } finally {
    d.ports.db.close();
  }
});
