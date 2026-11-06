import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { LinkAgentPassRequestSchema } from "@night-shares/proto/market/v1/market_pb";
import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import { mockSubjectFor } from "../../../../ports/identity-verifier/identity-verifier.mock";
import { fixture } from "../../testing/fixture";
import { completeAgentCheckpoint } from "./complete-checkpoint";
import { linkAgentPass } from "./link-agent-pass";
import { startAgentCheckpoint } from "./start-checkpoint";

async function setup() {
  const d = await fixture();
  d.user.humanId = mockSubjectFor("trader");
  const token = d.ports.sessions.create(d.user);
  return { ...d, token, ...agentPassSettings(d.ports) };
}
test("spend before link is rejected", async () => {
  const d = await setup();
  try {
    await expect(
      startAgentCheckpoint(d, d.user, "order", d.token),
    ).rejects.toThrow("Link World ID Agent Pass");
  } finally {
    d.ports.db.close();
  }
});
test("enrollment rejects a different human and consumes proof request once", async () => {
  const d = await setup();
  try {
    const start = await linkAgentPass(
      d,
      d.user,
      create(LinkAgentPassRequestSchema),
      d.token,
    );
    expect(start.verification?.action).toBe(`link_agent_pass:${d.user.id}`);
    const input = create(LinkAgentPassRequestSchema, {
      requestId: start.verification?.requestId,
      proof: { case: "mockProof", value: "mock:attacker:orb" },
    });
    await expect(linkAgentPass(d, d.user, input, d.token)).rejects.toThrow(
      "signed-in World ID",
    );
    input.proof = { case: "mockProof", value: "mock:trader:orb" };
    await expect(linkAgentPass(d, d.user, input, d.token)).rejects.toThrow();
    expect(d.store.link(d.user.id)).toBeNull();
  } finally {
    d.ports.db.close();
  }
});
for (const taken of [false, true])
  test(`enrollment approves no order; foreign subject ownership ${taken}`, async () => {
    const d = await setup();
    try {
      const start = await linkAgentPass(
        d,
        d.user,
        create(LinkAgentPassRequestSchema),
        d.token,
      );
      const linked = await linkAgentPass(
        d,
        d.user,
        create(LinkAgentPassRequestSchema, {
          requestId: start.verification?.requestId,
          proof: { case: "mockProof", value: "mock:trader:orb" },
        }),
        d.token,
      );
      const attempt = d.store.get(linked.checkpoint?.attemptId ?? "");
      if (!attempt) throw new Error("Missing enrollment checkpoint");
      expect(attempt.allowEnrollment).toBe(true);
      expect(attempt.orderId).toBe("");
      attempt.browser = "browser";
      d.store.save(attempt);
      if (taken)
        d.store.enroll("other", d.config.agentPassIssuer, `mock:${d.user.id}`);
      expect(
        await completeAgentCheckpoint(d, {
          state: attempt.state,
          browser: "browser",
          code: "approve",
        }),
      ).toBe(taken ? "denied" : "approved");
      expect(d.repo.account(d.user.humanId).orders.size).toBe(0);
      expect(
        d.ports.activity.list({ kinds: ["agent_order_filled"] }),
      ).toHaveLength(0);
      expect(!!d.store.link(d.user.id)).toBe(!taken);
    } finally {
      d.ports.db.close();
    }
  });
