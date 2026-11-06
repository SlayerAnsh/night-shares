import { expect, test } from "bun:test";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { agentPassSettings } from "../../src/ports/agent-pass/settings";
import type { MockClock } from "../../src/ports/clock/clock.mock";
import { createHarness } from "./harness";

async function setup() {
  const h = await createHarness();
  const session = await h.signInAs("orb", "checkpoint");
  const m = session.clients.market;
  await m.fundAgentWallet({ amount: { micros: 5_000_000_000n } });
  await m.setAgentBudget({
    totalBudget: { micros: 5_000_000_000n },
    perOrderCap: { micros: 5_000_000_000n },
  });
  const { order } = await m.createAgentOrder({
    night: {
      propertyId: "prop_velana",
      roomTypeId: "rt_velana_0",
      date: "2026-12-20",
    },
    size: { tenths: 5 },
    budget: { micros: 5_000_000_000n },
  });
  if (!order) throw new Error("Missing order");
  const start = await m.startAgentCheckpoint({ orderId: order.id });
  // The ephemeral test listener substitutes only the origin of the configured callback.
  const local = (href: string) => {
    const u = new URL(href);
    return `${h.baseUrl}${u.pathname}${u.search}`;
  };
  const begin = await fetch(local(start.authorizeUrl), { redirect: "manual" });
  expect(begin.status).toBe(303);
  const cookie = begin.headers.get("set-cookie")?.split(";")[0] ?? "";
  const authorize = begin.headers.get("location") ?? "";
  expect((await fetch(local(authorize), { headers: { cookie } })).status).toBe(
    200,
  );
  const state = new URL(authorize).searchParams.get("state") ?? "";
  const callback = async (query: string) =>
    fetch(`${h.baseUrl}/agent-pass/callback?state=${state}&${query}`, {
      headers: { cookie },
      redirect: "manual",
    });
  return { h, m, order, start, callback, session, local };
}
test("mock HTTP handoff, fresh completion and backend validation run protected action once", async () => {
  const d = await setup();
  try {
    expect(d.order.status).toBe(AgentOrderStatus.PENDING);
    const reply = await d.callback("code=approve");
    expect(reply.headers.get("location")).toBe(
      "http://localhost:3000/trade/portfolio?checkpoint=approved",
    );
    expect(
      (await d.m.getAgentCheckpoint({ attemptId: d.start.attemptId })).status,
    ).toBe("used");
    expect((await d.m.getPortfolio({})).agentOrders[0]?.status).toBe(
      AgentOrderStatus.EXECUTED,
    );
    const spent = (await d.m.getAgentWallet({})).wallet?.spent?.micros;
    expect(spent).toBeGreaterThan(0n);
    expect(
      (await d.callback("code=approve")).headers.get("location"),
    ).toContain("checkpoint=mismatch");
    expect((await d.m.getAgentWallet({})).wallet?.spent?.micros).toBe(spent);
    expect(
      (await fetch(d.local(d.start.authorizeUrl), { redirect: "manual" }))
        .status,
    ).toBe(403);
  } finally {
    await d.h.close();
  }
});
for (const outcome of ["denied", "cancelled", "expired", "mismatch"]) {
  test(`mock ${outcome} never executes protected action`, async () => {
    const d = await setup();
    try {
      if (outcome === "expired")
        (d.h.container.ports.clock as MockClock).advance(600_000);
      if (outcome === "mismatch")
        agentPassSettings(d.h.container.ports).store.enroll(
          d.session.user.id,
          "https://auth.world.org",
          "different-subject",
        );
      const query =
        outcome === "denied"
          ? "error=access_denied"
          : outcome === "cancelled"
            ? "error=cancelled"
            : "code=approve";
      const response = await d.callback(query);
      expect(response.headers.get("location")).toContain(
        `checkpoint=${outcome === "mismatch" ? "denied" : outcome}`,
      );
      const result = await d.m.getAgentCheckpoint({
        attemptId: d.start.attemptId,
      });
      expect(result.status).toBe(outcome === "mismatch" ? "denied" : outcome);
      if (outcome === "mismatch") expect(result.reason).toBe("access_denied");
      expect((await d.m.getPortfolio({})).agentOrders[0]?.status).toBe(
        AgentOrderStatus.PENDING,
      );
      expect((await d.m.getAgentWallet({})).wallet?.spent?.micros).toBe(0n);
      expect(
        d.h.container.ports.activity.list({ kinds: ["agent_order_filled"] }),
      ).toHaveLength(0);
    } finally {
      await d.h.close();
    }
  });
}
