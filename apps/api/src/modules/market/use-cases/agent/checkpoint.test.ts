import { afterEach, expect, test } from "bun:test";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import type { MockClock } from "../../../../ports/clock/clock.mock";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import { approveAgentOrder } from "../account/approve-agent-order";
import { checkpointFixture } from "./checkpoint.testing";
import { completeAgentCheckpoint } from "./complete-checkpoint";
import { getAgentCheckpoint } from "./get-checkpoint";
import { startAgentCheckpoint } from "./start-checkpoint";

const fixtures: Awaited<ReturnType<typeof checkpointFixture>>[] = [];
afterEach(() => {
  for (const d of fixtures.splice(0)) d.ports.db.close();
});
async function setup() {
  const d = await checkpointFixture();
  fixtures.push(d);
  return d;
}
test("fresh checkpoint commits order against linked identity once, including concurrent callbacks", async () => {
  const d = await setup();
  expect(d.order.status).toBe(AgentOrderStatus.PENDING);
  const results = await Promise.all([
    completeAgentCheckpoint(d, d.callback),
    completeAgentCheckpoint(d, d.callback),
  ]);
  expect(results.sort()).toEqual(["approved", "mismatch"]);
  expect(getAgentCheckpoint(d, d.user, d.a.id).status).toBe("used");
  expect(d.repo.account(d.user.humanId).orders.get(d.order.id)?.status).toBe(
    AgentOrderStatus.EXECUTED,
  );
  expect(d.ports.activity.list({ kinds: ["agent_order_filled"] })).toHaveLength(
    1,
  );
  expect(d.store.link(d.user.id)?.sub).toBe(`mock:${d.user.id}`);
  expect(await completeAgentCheckpoint(d, d.callback)).toBe("mismatch");
});
for (const reason of [
  "access_denied",
  "cancelled",
  "expired",
  "unmet_authentication_requirements",
  "login_required",
]) {
  test(`${reason} leaves inventory, wallet and order blocked`, async () => {
    const d = await setup();
    const before = d.ports.inventory.get(d.key);
    const balance = await d.ports.walletProvider.balance(d.order.walletAddress);
    if (reason === "expired") (d.ports.clock as MockClock).advance(600_000);
    const status = await completeAgentCheckpoint(d, {
      ...d.callback,
      error: reason,
    });
    expect(status).toBe(
      reason === "expired" || reason === "cancelled" ? reason : "denied",
    );
    expect(d.repo.account(d.user.humanId).orders.get(d.order.id)?.status).toBe(
      AgentOrderStatus.PENDING,
    );
    expect(d.ports.inventory.get(d.key)).toEqual(before);
    expect(await d.ports.walletProvider.balance(d.order.walletAddress)).toBe(
      balance,
    );
    expect(d.store.link(d.user.id)?.sub).toBe(`mock:${d.user.id}`);
    expect(
      d.ports.activity.list({ kinds: ["agent_order_filled"] }),
    ).toHaveLength(0);
  });
}
test("wrong browser, state and session cannot authorize a checkpoint", async () => {
  const d = await setup();
  expect(
    await completeAgentCheckpoint(d, { ...d.callback, browser: "wrong" }),
  ).toBe("mismatch");
  expect(
    await completeAgentCheckpoint(d, { ...d.callback, state: "wrong" }),
  ).toBe("mismatch");
  d.ports.sessions.delete(d.token);
  expect(await completeAgentCheckpoint(d, d.callback)).toBe("denied");
  expect(() =>
    getAgentCheckpoint(d, { ...d.user, id: "other" }, d.a.id),
  ).toThrow("Checkpoint not found");
});
test("linked subject mismatch and identity already assigned elsewhere fail closed", async () => {
  for (const elsewhere of [false, true]) {
    const d = await setup();
    d.ports.db
      .query("DELETE FROM agent_pass_links WHERE user_id = ?")
      .run(d.user.id);
    d.store.enroll(
      elsewhere ? "other" : d.user.id,
      d.config.agentPassIssuer,
      elsewhere ? `mock:${d.user.id}` : "different",
    );
    expect(await completeAgentCheckpoint(d, d.callback)).toBe("denied");
    expect(d.store.get(d.a.id)?.reason).toBe("access_denied");
    expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
  }
});
test("changed budget or action snapshot requires new approval", async () => {
  const d = await setup();
  agentWallets(d.ports.db).set(d.user, 9_000_000_000n, 9_000_000_000n, []);
  expect(await completeAgentCheckpoint(d, d.callback)).toBe("denied");
  expect(d.store.get(d.a.id)?.reason).toBe("mismatch");
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
});
test("settlement failure rolls back inventory, budget and order, preserving identity link", async () => {
  const d = await setup();
  const before = d.ports.inventory.get(d.key);
  d.ports.db
    .query("UPDATE wallet_balances SET balance_micros = 0 WHERE address = ?")
    .run(d.order.walletAddress);
  expect(await completeAgentCheckpoint(d, d.callback)).toBe("denied");
  expect(d.ports.inventory.get(d.key)).toEqual(before);
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
  expect(d.repo.account(d.user.humanId).orders.get(d.order.id)?.status).toBe(
    AgentOrderStatus.PENDING,
  );
  expect(d.store.link(d.user.id)?.sub).toBe(`mock:${d.user.id}`);
  expect(d.ports.activity.list({ kinds: ["agent_order_filled"] })).toHaveLength(
    0,
  );
});
test("default policy rejects IDKit approval and unauthenticated start", async () => {
  const d = await setup();
  await expect(
    approveAgentOrder(d, d.user, d.order.id, "token"),
  ).rejects.toThrow("Agent Pass");
  await expect(
    startAgentCheckpoint(d, d.user, d.order.id, "bad"),
  ).rejects.toThrow("Sign in");
});

test("failure after ledger writes rolls back the entire approval transaction", async () => {
  const d = await setup();
  const before = d.ports.inventory.get(d.key);
  const balance = await d.ports.walletProvider.balance(d.order.walletAddress);
  d.ports.db.exec(
    "CREATE TRIGGER reject_activity BEFORE INSERT ON activity WHEN NEW.kind = 'agent_order_filled' BEGIN SELECT RAISE(ABORT, 'Injected activity failure'); END",
  );
  expect(await completeAgentCheckpoint(d, d.callback)).toBe("denied");
  expect(await d.ports.walletProvider.balance(d.order.walletAddress)).toBe(
    balance,
  );
  expect(d.ports.inventory.get(d.key)).toEqual(before);
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
  expect(d.repo.account(d.user.humanId).orders.get(d.order.id)?.status).toBe(
    AgentOrderStatus.PENDING,
  );
  expect(d.ports.activity.list({ kinds: ["agent_order_filled"] })).toHaveLength(
    0,
  );
});

test("expiry during provider redemption leaves the protected action blocked", async () => {
  const d = await setup();
  const complete = d.adapter.completeCheckpoint;
  d.adapter.completeCheckpoint = async (input) => {
    const result = await complete(input);
    (d.ports.clock as MockClock).advance(600_000);
    return result;
  };
  expect(await completeAgentCheckpoint(d, d.callback)).toBe("expired");
  expect(d.store.get(d.a.id)?.status).toBe("expired");
  expect(agentWallets(d.ports.db).get(d.user).spent).toBe(0n);
});
