import { expect, test } from "bun:test";
import { signalHash } from "./signal-hash";
import { enrollment, jsonProof, setupWorldId } from "./world-id-test-fixture";

test("per-order uniqueness and linked session continuity are both required; replay with a fresh request fails", async () => {
  const s = setupWorldId();
  try {
    const signup = await s.verifier.startRequest("orb");
    await s.verifier.verifyProof({
      requestId: signup.requestId,
      action: "sign_in",
      proof: jsonProof(enrollment(signup)),
    });
    s.db
      .query(
        "INSERT INTO identity_users VALUES ('66', 'usr_alice', 'orb', 'wallet')",
      )
      .run();
    for (const index of [1, 2]) {
      const request = await s.verifier.startRequest(
        "orb",
        "approve_agent_order",
        "usr_alice",
        { resourceId: "ord_1" },
      );
      expect(request.action).toBe("approve_agent_order:ord_1");
      const payload = {
        uniqueness: enrollment(request, "0x99"),
        continuity: {
          protocol_version: "4.0",
          nonce: request.context?.continuity?.nonce,
          environment: "staging",
          session_id: "session_alice",
          responses: [
            {
              identifier: "proof_of_human",
              signal_hash: signalHash(request.signal),
              session_nullifier: [String(index), "0x50"],
            },
          ],
        },
      };
      const result = s.verifier.verifyProof({
        requestId: request.requestId,
        action: "approve_agent_order",
        userId: "usr_alice",
        proof: jsonProof(payload),
      });
      if (index === 1)
        await expect(result).resolves.toMatchObject({
          subject: "66",
          nullifier: "153",
        });
      else await expect(result).rejects.toThrow("already used");
    }
    expect(
      s.db
        .query(
          "SELECT * FROM world_id_nullifiers WHERE action = 'approve_agent_order:ord_1'",
        )
        .all(),
    ).toHaveLength(1);
  } finally {
    s.db.close();
  }
});
