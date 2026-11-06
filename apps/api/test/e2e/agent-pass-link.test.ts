import { expect, test } from "bun:test";
import { createSqliteMarketRepo } from "../../src/modules/market/repo/market-repo.sqlite";
import { completeAgentCheckpoint } from "../../src/modules/market/use-cases/agent/complete-checkpoint";
import { agentPassSettings } from "../../src/ports/agent-pass/settings";
import { createHarness } from "./harness";

test("Agent Pass link requires matching human, never executes orders, and spending requires matching linked sub", async () => {
  const h = await createHarness();
  try {
    const { clients, user } = await h.signIn("orb", "trader");
    const night = {
      propertyId: "prop_velana",
      roomTypeId: "rt_velana_0",
      date: "2026-12-20",
    };
    await clients.market.fundAgentWallet({
      amount: { micros: 10_000_000_000n },
    });
    await clients.market.setAgentBudget({
      totalBudget: { micros: 10_000_000_000n },
      perOrderCap: { micros: 10_000_000_000n },
    });
    const { order } = await clients.market.createAgentOrder({
      night,
      size: { tenths: 5 },
      budget: { micros: 10_000_000_000n },
    });
    await expect(
      clients.market.startAgentCheckpoint({ orderId: order?.id }),
    ).rejects.toThrow("Link World ID Agent Pass");
    const wrong = await clients.market.linkAgentPass({});
    await expect(
      clients.market.linkAgentPass({
        requestId: wrong.verification?.requestId,
        proof: { case: "mockProof", value: "mock:attacker:orb" },
      }),
    ).rejects.toThrow("signed-in World ID");
    const start = await clients.market.linkAgentPass({});
    const linked = await clients.market.linkAgentPass({
      requestId: start.verification?.requestId,
      proof: { case: "mockProof", value: "mock:trader:orb" },
    });
    const { ports } = h.container;
    const { store, adapter } = agentPassSettings(ports);
    const deps = { ports, repo: createSqliteMarketRepo(ports.db) };
    const attempt = store.get(linked.checkpoint?.attemptId ?? "");
    if (!attempt) throw new Error("Missing enrollment checkpoint");
    attempt.browser = "e2e-browser";
    store.save(attempt);
    expect(
      await completeAgentCheckpoint(deps, {
        state: attempt.state,
        browser: attempt.browser,
        code: "approve",
      }),
    ).toBe("approved");
    expect(
      (await clients.market.getAgentWallet({})).wallet?.agentPassLinked,
    ).toBe(true);
    expect(ports.activity.list({ kinds: ["agent_order_filled"] })).toHaveLength(
      0,
    );
    const spend = await clients.market.startAgentCheckpoint({
      orderId: order?.id,
    });
    const a = store.get(spend.attemptId);
    if (!a) throw new Error("Missing spend checkpoint");
    expect(a.allowEnrollment).toBe(false);
    a.browser = "e2e-browser";
    store.save(a);
    const complete = adapter.completeCheckpoint;
    adapter.completeCheckpoint = async (input) => ({
      ...(await complete(input)),
      sub: "attacker",
    });
    expect(
      await completeAgentCheckpoint(deps, {
        state: a.state,
        browser: a.browser,
        code: "approve",
      }),
    ).toBe("denied");
    expect(ports.activity.list({ kinds: ["agent_order_filled"] })).toHaveLength(
      0,
    );
    expect(user?.id).toBeTruthy();
  } finally {
    await h.close();
  }
});
