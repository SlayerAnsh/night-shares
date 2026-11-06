import { expect, test } from "bun:test";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { fixture } from "../../testing/fixture";
import { approveAgentOrder } from "./approve-agent-order";
import { createAgentOrder } from "./create-agent-order";

test("large order needs a user-bound fresh token and executes only once", async () => {
  const d = await fixture();
  d.key = "prop_velana:rt_velana_0:2026-12-20";
  const { order } = await createAgentOrder(d, d.user, d.key, 5, 10000000000n);
  await expect(approveAgentOrder(d, d.user, order.id, "")).rejects.toThrow(
    "Fresh World ID",
  );
  const wrong = d.ports.verifications.issue({
    userId: "other",
    action: "approve_agent_order",
  });
  await expect(
    approveAgentOrder(d, d.user, order.id, wrong.token),
  ).rejects.toThrow("Fresh World ID");
  const token = d.ports.verifications.issue({
    userId: d.user.id,
    action: "approve_agent_order",
  }).token;
  const response = await approveAgentOrder(d, d.user, order.id, token);
  expect(response.order.status).toBe(AgentOrderStatus.EXECUTED);
  expect(response.execution.quote?.filled?.tenths).toBe(5);
  await expect(approveAgentOrder(d, d.user, order.id, token)).rejects.toThrow(
    "already executed",
  );
});
