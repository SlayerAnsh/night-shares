import { expect, test } from "bun:test";
import { signalHash } from "./signal-hash";
import { enrollment, jsonProof, setupWorldId } from "./world-id-test-fixture";

test("returning login uses the saved session and never treats session_nullifier as humanId", async () => {
  const s = setupWorldId();
  try {
    const first = await s.verifier.startRequest("orb");
    await s.verifier.verifyProof({
      requestId: first.requestId,
      action: "sign_in",
      proof: jsonProof(enrollment(first)),
    });
    for (const nonce of ["0x100", "0x101"]) {
      const request = await s.verifier.startRequest(
        "orb",
        "sign_in",
        undefined,
        { sessionId: "session_alice" },
      );
      expect(request.action).toBe("");
      const payload = {
        protocol_version: "4.0",
        nonce: request.context?.nonce,
        environment: "staging",
        session_id: "session_alice",
        responses: [
          {
            identifier: "proof_of_human",
            signal_hash: signalHash(request.signal),
            session_nullifier: [nonce, "0x200"],
            proof: [],
          },
        ],
      };
      const result = await s.verifier.verifyProof({
        requestId: request.requestId,
        action: "sign_in",
        proof: jsonProof(payload),
      });
      expect(result.subject).toBe("66");
      expect(result.nullifier).not.toBe(result.subject);
    }
    const request = await s.verifier.startRequest("orb", "sign_in", undefined, {
      sessionId: "session_alice",
    });
    await expect(
      s.verifier.verifyProof({
        requestId: request.requestId,
        action: "sign_in",
        proof: jsonProof({
          protocol_version: "4.0",
          nonce: request.context?.nonce,
          environment: "staging",
          session_id: "session_alice",
          responses: [
            {
              identifier: "proof_of_human",
              signal_hash: signalHash(request.signal),
              session_nullifier: ["0x100", "0x200"],
            },
          ],
        }),
      }),
    ).rejects.toThrow("already used");
  } finally {
    s.db.close();
  }
});

test("Selfie to Orb upgrade links distinct nullifiers and preserves bans, wallet, user and old sessions", async () => {
  const s = setupWorldId();
  try {
    const selfie = await s.verifier.startRequest("device");
    await s.verifier.verifyProof({
      requestId: selfie.requestId,
      action: "sign_in",
      proof: jsonProof(enrollment(selfie, "0x11", "session_selfie", "selfie")),
    });
    s.db
      .query(
        "INSERT INTO identity_users VALUES ('17', 'usr_alice', 'device', 'wallet_alice')",
      )
      .run();
    s.db.query("INSERT INTO walk_bans VALUES ('17', 'report_false', 1)").run();
    const orb = await s.verifier.startRequest("orb", "sign_in", "usr_alice");
    const verified = await s.verifier.verifyProof({
      requestId: orb.requestId,
      action: "sign_in",
      userId: "usr_alice",
      proof: jsonProof(enrollment(orb)),
    });
    expect(verified.subject).toBe("66");
    expect(
      s.db
        .query(
          "SELECT id, wallet_address FROM identity_users WHERE human_id = '66'",
        )
        .get(),
    ).toEqual({ id: "usr_alice", wallet_address: "wallet_alice" });
    expect(s.db.query("SELECT human_id FROM walk_bans").get()).toEqual({
      human_id: "66",
    });
    const recovery = await s.verifier.startRequest("device");
    const recovered = await s.verifier.verifyProof({
      requestId: recovery.requestId,
      action: "sign_in",
      proof: jsonProof(
        enrollment(recovery, "17", "session_recovery", "selfie"),
      ),
    });
    expect(recovered.subject).toBe("66");
    expect(
      s.db.query("SELECT * FROM world_id_sessions WHERE human_id = '66'").all(),
    ).toHaveLength(3);
  } finally {
    s.db.close();
  }
});
