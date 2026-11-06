import { expect, test } from "bun:test";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createMockIdentityVerifier } from "./identity-verifier.mock";

test("one action keeps the subject stable and every purpose requires a fresh request", async () => {
  const clock = createMockClock(0);
  const verifier = createMockIdentityVerifier({
    clock,
    ids: createMockIdGenerator(),
  });
  const proof = "mock:alice:orb";
  const signIn = await verifier.startRequest("orb");
  const first = await verifier.verifyProof({
    proof,
    action: "sign_in",
    requestId: signIn.requestId,
  });
  const checkIn = await verifier.startRequest(
    "device",
    "check_in",
    "usr_alice",
  );
  const input = {
    proof,
    action: "check_in",
    userId: "usr_alice",
    requestId: checkIn.requestId,
  };
  expect(await verifier.verifyProof(input)).toEqual(first);
  await expect(verifier.verifyProof(input)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
  const expired = await verifier.startRequest("device");
  clock.advance(300_000);
  await expect(
    verifier.verifyProof({
      proof,
      action: "sign_in",
      requestId: expired.requestId,
    }),
  ).rejects.toThrow();
  await expect(
    verifier.verifyProof({ proof, action: "sign_in" }),
  ).rejects.toThrow();
});

test("failed proof burns its request and an Orb request rejects Device", async () => {
  const verifier = createMockIdentityVerifier({
    clock: createMockClock(0),
    ids: createMockIdGenerator(),
  });
  const { requestId } = await verifier.startRequest("orb");
  await expect(
    verifier.verifyProof({
      requestId,
      proof: "mock:alice:device",
      action: "sign_in",
    }),
  ).rejects.toThrow();
  await expect(
    verifier.verifyProof({
      requestId,
      proof: "mock:alice:orb",
      action: "sign_in",
    }),
  ).rejects.toThrow();
});
