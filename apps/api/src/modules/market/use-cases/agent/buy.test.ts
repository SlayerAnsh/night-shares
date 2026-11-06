import { expect, test } from "bun:test";
import { configureAgentPass } from "../../../../ports/agent-pass/settings";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import { createSqliteMarketRepo } from "../../repo/market-repo.sqlite";
import { fixture } from "../../testing/fixture";
import { approveAgentOrder } from "../account/approve-agent-order";
import { createAgentOrder } from "../account/create-agent-order";
import { buy } from "../trading/buy";
import { quoteBuy } from "../trading/quote-buy";
import { buyAgent } from "./buy";
import { setAgentBudget } from "./set-budget";
import { fundFixtureAgent } from "./testing";

test("SQLite reservation rolls inventory and position back when actual cost exceeds budget", async () => {
  const base = await fixture();
  const d = { ...base, repo: createSqliteMarketRepo(base.ports.db) };
  await fundFixtureAgent(d);
  await setAgentBudget(d, d.user, 1n, 1n, []);
  const before = d.ports.inventory.get(d.key);
  await expect(buyAgent(d, d.user, d.key, 1, 1000000000n)).rejects.toThrow(
    "agent budget",
  );
  expect(d.ports.inventory.get(d.key)).toEqual(before);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
});

test("approval rechecks budget after creation and leaves pending order unspent", async () => {
  const d = await fixture();
  configureAgentPass(d.ports, { agentApproval: "idkit" });
  await fundFixtureAgent(d);
  d.key = "prop_velana:rt_velana_0:2026-12-20";
  const { order } = await createAgentOrder(d, d.user, d.key, 5, 10000000000n);
  const before = d.ports.inventory.get(d.key);
  await setAgentBudget(d, d.user, 0n, 0n, []);
  const { token } = d.ports.verifications.issue({
    userId: d.user.id,
    action: "approve_agent_order",
    resourceId: order.id,
  });
  await expect(approveAgentOrder(d, d.user, order.id, token)).rejects.toThrow(
    "agent budget",
  );
  expect(d.ports.inventory.get(d.key)).toEqual(before);
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
});

test("agent and human orders share the per-night ownership cap", async () => {
  const d = await fixture();
  configureAgentPass(d.ports, { agentApproval: "idkit" });
  await fundFixtureAgent(d);
  const cap = quoteBuy(d, d.key, 1, d.user).cap;
  // The cap is checked from current inventory by both execution paths.
  await createAgentOrder(d, d.user, d.key, 1, 1000000000n);
  await expect(
    buy(d, d.user, d.key, cap?.tenths ?? 1000, 10000000000n),
  ).rejects.toThrow("Per-human cap");
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(1);
});

test("SQLite compensation restores reserved spend and position after settlement rejection", async () => {
  const base = await fixture();
  const d = { ...base, repo: createSqliteMarketRepo(base.ports.db) };
  await setAgentBudget(d, d.user, 1000000000n, 1000000000n, []);
  const before = d.ports.inventory.get(d.key);
  await expect(
    createAgentOrder(d, d.user, d.key, 1, 1000000000n),
  ).rejects.toThrow("Not enough USDC");
  const reloaded = createSqliteMarketRepo(d.ports.db);
  expect(reloaded.position(d.user.humanId, d.key).free).toBe(0);
  expect(reloaded.position(d.user.humanId, d.key).average).toBe(0n);
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
  expect(d.ports.inventory.get(d.key)).toEqual(before);
});
