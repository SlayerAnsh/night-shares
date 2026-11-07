import { expect, test } from "bun:test";
import { isWalkBanned } from "../../modules/walk/repo/bans";
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

for (const chainActive of [false, true]) {
  test(`Selfie to Orb upgrade preserves bans, wallet, user and old sessions (chain active: ${chainActive})`, async () => {
    const s = setupWorldId();
    try {
      if (chainActive) {
        s.db
          .query(
            "INSERT INTO chain_instances (fingerprint, deployment, active) VALUES ('test', '{}', 1)",
          )
          .run();
      }
      const canonical = chainActive ? "17" : "66";
      const selfie = await s.verifier.startRequest("device");
      await s.verifier.verifyProof({
        requestId: selfie.requestId,
        action: "sign_in",
        proof: jsonProof(
          enrollment(selfie, "0x11", "session_selfie", "selfie"),
        ),
      });
      s.db
        .query(
          "INSERT INTO identity_users (human_id, id, level, wallet_address) VALUES ('17', 'usr_alice', 'device', 'wallet_alice')",
        )
        .run();
      s.db
        .query(
          "INSERT INTO walk_bans (human_id, report_id, banned_at) VALUES ('17', 'report_false', 1)",
        )
        .run();
      s.db
        .query(
          "INSERT INTO market_holders (human_id, id, wallet_address) VALUES ('17', 'usr_alice', 'wallet_alice')",
        )
        .run();
      s.db
        .query(
          "INSERT INTO market_human_wallets (wallet_address, human_id) VALUES ('wallet_alice', '17')",
        )
        .run();
      const oldSession = {
        id: "usr_alice",
        humanId: "17",
        level: "device",
        walletAddress: "wallet_alice",
      };
      s.db
        .query(
          "INSERT INTO sessions (token_hash, user, expires_at) VALUES ('old_session', ?, 999999)",
        )
        .run(JSON.stringify(oldSession));
      const orb = await s.verifier.startRequest("orb", "sign_in", "usr_alice");
      const verified = await s.verifier.verifyProof({
        requestId: orb.requestId,
        action: "sign_in",
        userId: "usr_alice",
        proof: jsonProof(enrollment(orb)),
      });
      expect(verified.subject).toBe(canonical);
      expect(
        s.db
          .query(
            "SELECT id, wallet_address, level FROM identity_users WHERE human_id = ?",
          )
          .get(canonical),
      ).toEqual({
        id: "usr_alice",
        wallet_address: "wallet_alice",
        level: "orb",
      });
      expect(s.db.query("SELECT human_id FROM walk_bans").get()).toEqual({
        human_id: "17",
      });
      expect(
        s.db
          .query(
            "SELECT human_id, level FROM world_id_enrollments WHERE nullifier = '66'",
          )
          .get(),
      ).toEqual({ human_id: canonical, level: "orb" });
      expect(
        s.db
          .query("SELECT human_id FROM market_holders WHERE id = 'usr_alice'")
          .get(),
      ).toEqual({ human_id: canonical });
      expect(
        s.db
          .query(
            "SELECT human_id FROM market_human_wallets WHERE wallet_address = 'wallet_alice'",
          )
          .get(),
      ).toEqual({ human_id: canonical });
      expect(
        s.db
          .query(
            "SELECT human_id, level FROM world_id_sessions WHERE session_id = 'session_selfie'",
          )
          .get(),
      ).toEqual({ human_id: canonical, level: "device" });
      const savedSession = s.db
        .query<{ user: string }, []>(
          "SELECT user FROM sessions WHERE token_hash = 'old_session'",
        )
        .get();
      expect(JSON.parse(savedSession?.user ?? "null")).toEqual({
        ...oldSession,
        humanId: canonical,
      });
      for (const banned of ["17", "66", "older"]) {
        s.db
          .query(
            "INSERT OR IGNORE INTO world_id_enrollments (nullifier, human_id, level) VALUES ('older', ?, 'device')",
          )
          .run(canonical);
        s.db.query("DELETE FROM walk_bans").run();
        s.db
          .query(
            "INSERT INTO walk_bans (human_id, report_id, banned_at) VALUES (?, 'report_false', 1)",
          )
          .run(banned);
        for (const alias of ["17", "66", "older"]) {
          expect(isWalkBanned(s.db, alias)).toBe(true);
        }
        expect(isWalkBanned(s.db, "unrelated")).toBe(false);
      }
      const recovery = await s.verifier.startRequest("device");
      const recovered = await s.verifier.verifyProof({
        requestId: recovery.requestId,
        action: "sign_in",
        proof: jsonProof(
          enrollment(recovery, "17", "session_recovery", "selfie"),
        ),
      });
      expect(recovered.subject).toBe(canonical);
      expect(
        s.db
          .query("SELECT * FROM world_id_sessions WHERE human_id = ?")
          .all(canonical),
      ).toHaveLength(3);
    } finally {
      s.db.close();
    }
  });
}
