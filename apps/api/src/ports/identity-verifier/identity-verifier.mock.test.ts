import { expect, test } from "bun:test";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createMockIdentityVerifier } from "./identity-verifier.mock";

test("mock proofs bind nullifiers to seed and action; requests expire and cannot replay", async () => {
  const clock = createMockClock(0);
  const verifier = createMockIdentityVerifier({
    clock,
    ids: createMockIdGenerator(),
  });
  const proof = "mock:alice:orb";
  const first = await verifier.verifyProof({ proof, action: "signin" });
  expect(
    await verifier.verifyProof({
      proof: "mock:alice:device",
      action: "signin",
    }),
  ).toMatchObject({ nullifier: first.nullifier });
  expect(
    (await verifier.verifyProof({ proof, action: "checkin" })).nullifier,
  ).not.toBe(first.nullifier);
  await expect(
    verifier.verifyProof({ proof: "mock:broken", action: "signin" }),
  ).rejects.toThrow();
  const request = await verifier.startRequest("orb");
  await expect(
    verifier.verifyProof({
      requestId: request.requestId,
      proof: "mock:alice:device",
      action: "signin",
    }),
  ).rejects.toThrow();
  await verifier.verifyProof({
    requestId: request.requestId,
    proof,
    action: "signin",
  });
  await expect(
    verifier.verifyProof({
      requestId: request.requestId,
      proof,
      action: "signin",
    }),
  ).rejects.toThrow();
  const expired = await verifier.startRequest("device");
  clock.advance(300_000);
  await expect(
    verifier.verifyProof({
      requestId: expired.requestId,
      proof,
      action: "signin",
    }),
  ).rejects.toThrow();
});
