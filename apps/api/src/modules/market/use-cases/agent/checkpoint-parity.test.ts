import { expect, test } from "bun:test";
import { configureAgentPass } from "../../../../ports/agent-pass/settings";
import { approveAgentOrder } from "../account/approve-agent-order";
import { checkpointFixture } from "./checkpoint.testing";
import { completeAgentCheckpoint } from "./complete-checkpoint";

test("atomic checkpoint and legacy approval preserve identical pricing, fees and inventory", async () => {
  const a = await checkpointFixture();
  const b = await checkpointFixture();
  try {
    expect(await completeAgentCheckpoint(a, a.callback)).toBe("approved");
    configureAgentPass(b.ports, { agentApproval: "idkit" });
    const { token } = b.ports.verifications.issue({
      userId: b.user.id,
      action: "approve_agent_order",
      resourceId: b.order.id,
    });
    await approveAgentOrder(b, b.user, b.order.id, token);
    expect(a.ports.inventory.get(a.key)).toEqual(b.ports.inventory.get(b.key));
    expect(
      a.repo.account(a.user.humanId).orders.get(a.order.id)?.spent,
    ).toEqual(b.repo.account(b.user.humanId).orders.get(b.order.id)?.spent);
    const balances =
      "SELECT address, balance_micros FROM wallet_balances ORDER BY address";
    expect(a.ports.db.query(balances).all()).toEqual(
      b.ports.db.query(balances).all(),
    );
    const transfers =
      "SELECT from_address, to_address, amount_micros, memo FROM wallet_transactions ORDER BY sequence";
    expect(a.ports.db.query(transfers).all()).toEqual(
      b.ports.db.query(transfers).all(),
    );
  } finally {
    a.ports.db.close();
    b.ports.db.close();
  }
});
