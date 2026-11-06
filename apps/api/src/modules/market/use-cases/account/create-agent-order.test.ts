import { expect, test } from "bun:test";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { fixture } from "../../testing/fixture";
import { createAgentOrder } from "./create-agent-order";

test("small order executes immediately into the shared human position", async () => {
  const d = await fixture();
  const { order } = await createAgentOrder(d, d.user, d.key, 1, 1000000000n);
  expect(order.status).toBe(AgentOrderStatus.EXECUTED);
  expect(d.repo.position(d.user.humanId, d.key).free).toBe(1);
});
test("large order remains pending and does not reserve inventory", async () => {
  const d = await fixture();
  d.key = "prop_velana:rt_velana_0:2026-12-20";
  const before = d.ports.inventory.get(d.key);
  d.key = "prop_velana:rt_velana_0:2026-12-20";
  const { order } = await createAgentOrder(d, d.user, d.key, 5, 10000000000n);
  expect(order.status).toBe(AgentOrderStatus.PENDING);
  expect(order.requiresVerification).toBe(true);
  expect(d.ports.inventory.get(d.key)).toEqual(before);
});
