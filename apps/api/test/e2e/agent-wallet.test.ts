import { afterAll, beforeAll, expect, test } from "bun:test";
import { Code } from "@connectrpc/connect";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { createHarness } from "./harness";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h?.close();
});
const night = {
  propertyId: "prop_velana",
  roomTypeId: "rt_velana_0",
  date: "2026-12-01",
};

test("agent wallet RPCs require Orb", async () => {
  const { clients } = await h.signInAs("device", "agent_device");
  for (const call of [
    () => clients.market.getAgentWallet({}),
    () => clients.market.fundAgentWallet({ amount: { micros: 1n } }),
    () => clients.market.withdrawAgentWallet({ amount: { micros: 1n } }),
    () =>
      clients.market.setAgentBudget({
        totalBudget: { micros: 1n },
        perOrderCap: { micros: 1n },
      }),
  ])
    await expect(call()).rejects.toMatchObject({ code: Code.PermissionDenied });
});

test("fund, budget, execute, inspect portfolio and withdraw from isolated wallet", async () => {
  const { clients } = await h.signInAs("orb", "agent_wallet_flow");
  const m = clients.market;
  const empty = required((await m.getAgentWallet({})).wallet);
  expect(empty.address.startsWith("agent:")).toBe(true);
  expect(empty.balance?.micros).toBe(0n);
  await m.fundAgentWallet({ amount: { micros: 500000000n } });
  await m.setAgentBudget({
    totalBudget: { micros: 500000000n },
    perOrderCap: { micros: 1n },
    allowedNights: [night],
  });
  const order = { night, size: { tenths: 1 }, budget: { micros: 500000000n } };
  await expect(m.createAgentOrder(order)).rejects.toMatchObject({
    code: Code.FailedPrecondition,
  });
  await m.setAgentBudget({
    totalBudget: { micros: 500000000n },
    perOrderCap: { micros: 500000000n },
    allowedNights: [night],
  });
  const result = required((await m.createAgentOrder(order)).order);
  expect(result.status).toBe(AgentOrderStatus.EXECUTED);
  expect(result.walletAddress).toBe(empty.address);
  const p = await m.getPortfolio({});
  expect(p.agentWallet?.spent?.micros).toBe(result.spent?.micros);
  expect(p.agentWallet?.holdings[0]?.size?.tenths).toBe(1);
  const balance = required(p.agentWallet?.balance).micros;
  const withdrawn = await m.withdrawAgentWallet({
    amount: { micros: balance },
  });
  expect(withdrawn.wallet?.balance?.micros).toBe(0n);
  expect(withdrawn.wallet?.spent?.micros).toBe(result.spent?.micros);
  await expect(m.createAgentOrder(order)).rejects.toMatchObject({
    code: Code.FailedPrecondition,
  });
  const other = await h.signInAs("orb", "agent_wallet_other");
  expect(
    (await other.clients.market.getAgentWallet({})).wallet?.balance?.micros,
  ).toBe(0n);
});

test("approval rechecks changed budget and high-value order requires verification", async () => {
  const { clients, user } = await h.signInAs("orb", "agent_wallet_approve");
  const m = clients.market;
  await m.fundAgentWallet({ amount: { micros: 10000000000n } });
  await m.setAgentBudget({
    totalBudget: { micros: 10000000000n },
    perOrderCap: { micros: 10000000000n },
  });
  const order = required(
    (
      await m.createAgentOrder({
        night: { ...night, date: "2026-12-20" },
        size: { tenths: 5 },
        budget: { micros: 10000000000n },
      })
    ).order,
  );
  expect(order.requiresVerification).toBe(true);
  await expect(
    m.approveAgentOrder({ orderId: order.id }),
  ).rejects.toMatchObject({ code: Code.PermissionDenied });
  await m.setAgentBudget({
    totalBudget: { micros: 0n },
    perOrderCap: { micros: 0n },
  });
  const { token } = h.container.ports.verifications.issue({
    userId: user.id,
    action: "approve_agent_order",
  });
  await expect(
    m.approveAgentOrder({ orderId: order.id, verificationToken: token }),
  ).rejects.toMatchObject({ code: Code.FailedPrecondition });
  expect((await m.getAgentWallet({})).wallet?.spent?.micros).toBe(0n);
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected response field.");
  return value;
}
