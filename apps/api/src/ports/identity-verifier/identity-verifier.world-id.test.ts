import { expect, test } from "bun:test";
import { createWorldIdIdentityVerifier } from "./identity-verifier.world-id";
import { enrollment, jsonProof, setupWorldId } from "./world-id-test-fixture";

test("v4 forwards the complete result and normalizes the fixed enrollment nullifier", async () => {
  const s = setupWorldId();
  try {
    const request = await s.verifier.startRequest("orb");
    const payload = enrollment(request);
    const result = await s.verifier.verifyProof({
      requestId: request.requestId,
      action: "sign_in",
      proof: jsonProof(payload),
    });
    expect(result).toEqual({
      subject: "66",
      nullifier: "66",
      level: "orb",
      sessionId: "session_alice",
    });
    expect(s.fetcher.mock.calls[0]?.[0]).toBe(
      "https://developer.world.org/api/v4/verify/rp_test",
    );
    expect(s.fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(payload));
    expect(request.context?.signature).toMatch(/^0x/);
    expect(request.context?.allowLegacy).toBe(false);
  } finally {
    s.db.close();
  }
});

test("re-enrollment with a new session keeps the same human and both linked sessions", async () => {
  const s = setupWorldId();
  try {
    for (const [nullifier, session] of [
      ["0x0042", "session_old"],
      ["66", "session_new"],
    ]) {
      const request = await s.verifier.startRequest("orb");
      const verified = await s.verifier.verifyProof({
        requestId: request.requestId,
        action: "sign_in",
        proof: jsonProof(enrollment(request, nullifier, session)),
      });
      expect(verified.subject).toBe("66");
    }
    expect(s.db.query("SELECT * FROM world_id_enrollments").all()).toHaveLength(
      1,
    );
    expect(s.db.query("SELECT * FROM world_id_sessions").all()).toHaveLength(2);
  } finally {
    s.db.close();
  }
});

test("request survives recreation and concurrent replay reaches the provider once", async () => {
  const s = setupWorldId();
  try {
    const request = await s.verifier.startRequest("orb");
    const input = {
      requestId: request.requestId,
      action: "sign_in",
      proof: jsonProof(enrollment(request)),
    };
    const results = await Promise.allSettled([
      createWorldIdIdentityVerifier(s).verifyProof(input),
      s.verifier.verifyProof(input),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  } finally {
    s.db.close();
  }
});

test("wrong nonce, environment, action, credential and signal fail before provider", async () => {
  const s = setupWorldId();
  try {
    for (const variant of [
      "nonce",
      "environment",
      "action",
      "level",
      "signal",
    ]) {
      const request = await s.verifier.startRequest("orb");
      const payload = enrollment(request);
      const item = payload.responses[0];
      if (!item) throw new Error("Missing fixture response");
      if (variant === "level") item.identifier = "selfie";
      else if (variant === "signal") item.signal_hash = "0x123";
      else if (variant === "nonce") payload.nonce = "other";
      else if (variant === "environment") payload.environment = "production";
      else payload.action = "other";
      await expect(
        s.verifier.verifyProof({
          requestId: request.requestId,
          action: "sign_in",
          proof: jsonProof(payload),
        }),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    expect(s.fetcher).not.toHaveBeenCalled();
  } finally {
    s.db.close();
  }
});

test("provider errors, malformed responses and environment mismatch cannot authenticate", async () => {
  for (const response of [
    async () => Response.json({ code: "nullifier_replayed" }, { status: 400 }),
    async () => new Response("invalid JSON"),
    async () => Response.json({ success: true, environment: "production" }),
    async () => {
      throw new Error("private proof material");
    },
  ]) {
    const s = setupWorldId(response);
    try {
      const request = await s.verifier.startRequest("orb");
      await expect(
        s.verifier.verifyProof({
          requestId: request.requestId,
          action: "sign_in",
          proof: jsonProof(enrollment(request)),
        }),
      ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(s.db.query("SELECT * FROM world_id_sessions").all()).toHaveLength(
        0,
      );
    } finally {
      s.db.close();
    }
  }
});

test("production requests verify using the configured endpoint and environment", async () => {
  for (const verifyUrl of [undefined, "https://verify.example/{rp_id}"]) {
    const s = setupWorldId(async () =>
      Response.json({ success: true, environment: "production" }),
    );
    try {
      const verifier = createWorldIdIdentityVerifier({
        ...s,
        environment: undefined,
        verifyUrl,
      });
      const request = await verifier.startRequest("orb");
      expect(request.context?.environment).toBe("production");
      const payload = { ...enrollment(request), environment: "production" };
      expect(
        await verifier.verifyProof({
          requestId: request.requestId,
          action: "sign_in",
          proof: jsonProof(payload),
        }),
      ).toMatchObject({ level: "orb", subject: "66" });
      expect(s.fetcher.mock.calls[0]?.[0]).toBe(
        verifyUrl?.replace("{rp_id}", "rp_test") ??
          "https://developer.world.org/api/v4/verify/rp_test",
      );
    } finally {
      s.db.close();
    }
  }
});
