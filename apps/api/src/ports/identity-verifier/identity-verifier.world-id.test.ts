import { afterEach, expect, mock, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createWorldIdIdentityVerifier } from "./identity-verifier.world-id";
import { signalHash } from "./signal-hash";

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const proof = {
  merkleRoot: "0xroot",
  nullifierHash: "0xhuman",
  proof: "0xproof",
  verificationLevel: "orb",
};
// Response shapes from https://docs.world.org/api-reference/developer-portal/verify-legacy.
const success = {
  success: true,
  action: "night-shares-human",
  nullifier_hash: proof.nullifierHash,
  created_at: "2023-02-18T11:20:39.530041+00:00",
};
function setup(
  response: () => Promise<Response> = async () => Response.json(success),
) {
  const db = openDatabase(":memory:");
  databases.push(db);
  const clock = createMockClock(0);
  const fetcher = mock((_url: string | URL | Request, _options?: RequestInit) =>
    response(),
  );
  const deps = {
    db,
    clock,
    ids: createMockIdGenerator(),
    appId: "app_test",
    fetch: fetcher as unknown as typeof fetch,
  };
  return { ...deps, fetcher, verifier: createWorldIdIdentityVerifier(deps) };
}
test("cloud body binds the exact signal and returns the fixed-action nullifier as subject", async () => {
  const s = setup();
  const request = await s.verifier.startRequest("orb");
  expect(request.signal).toBe("sign_in:nonce_0001");
  const result = await s.verifier.verifyProof({
    requestId: request.requestId,
    proof,
    action: "sign_in",
  });
  expect(result).toEqual({
    subject: proof.nullifierHash,
    nullifier: proof.nullifierHash,
    level: "orb",
  });
  expect(s.fetcher.mock.calls[0]?.[0]).toBe(
    "https://developer.world.org/api/v2/verify/app_test",
  );
  const options = s.fetcher.mock.calls[0]?.[1];
  expect(JSON.parse(String(options?.body))).toEqual({
    merkle_root: proof.merkleRoot,
    nullifier_hash: proof.nullifierHash,
    proof: proof.proof,
    verification_level: "orb",
    action: "night-shares-human",
    signal_hash: signalHash(request.signal),
  });
  expect(options?.signal).toBeInstanceOf(AbortSignal);
  const second = await s.verifier.startRequest("device", "check_in", "usr_1");
  expect(
    await s.verifier.verifyProof({
      requestId: second.requestId,
      proof,
      action: "check_in",
      userId: "usr_1",
    }),
  ).toEqual(result);
});
test("nonce survives adapter recreation and cannot replay concurrently", async () => {
  const s = setup();
  const { requestId } = await s.verifier.startRequest("orb");
  const restarted = createWorldIdIdentityVerifier(s);
  const input = { requestId, proof, action: "sign_in" };
  const results = await Promise.allSettled([
    restarted.verifyProof(input),
    s.verifier.verifyProof(input),
  ]);
  expect(results.map((result) => result.status)).toEqual([
    "fulfilled",
    "rejected",
  ]);
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});
test("wrong purpose, wrong user, expired, mock and insufficient-level proofs never reach cloud", async () => {
  const s = setup();
  for (const variant of ["purpose", "user", "expired", "mock", "level"]) {
    const request = await s.verifier.startRequest("orb", "check_in", "usr_1");
    if (variant === "expired") s.clock.advance(300_000);
    await expect(
      s.verifier.verifyProof({
        requestId: request.requestId,
        action: variant === "purpose" ? "sign_in" : "check_in",
        userId: variant === "user" ? "usr_2" : "usr_1",
        proof:
          variant === "mock"
            ? "mock:alice:orb"
            : {
                ...proof,
                verificationLevel: variant === "level" ? "device" : "orb",
              },
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  }
  expect(s.fetcher).not.toHaveBeenCalled();
});
test("provider rejection, malformed response, mismatched identity and network failures are plain authentication errors", async () => {
  for (const respond of [
    async () =>
      Response.json(
        { code: "invalid_proof", detail: "private provider detail" },
        { status: 400 },
      ),
    async () => new Response("invalid JSON"),
    async () => Response.json({ ...success, nullifier_hash: "other" }),
    async () => Response.json({ ...success, action: "other" }),
    async () => Response.json({ success: false }),
    async () => {
      throw new Error("secret proof in upstream error");
    },
  ]) {
    const s = setup(respond);
    const { requestId } = await s.verifier.startRequest("orb");
    const input = { requestId, proof, action: "sign_in" };
    await expect(s.verifier.verifyProof(input)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "World ID verification failed. Please start a new request.",
    });
    await expect(s.verifier.verifyProof(input)).rejects.toThrow(
      "invalid or expired",
    );
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  }
});
