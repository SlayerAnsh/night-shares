import { expect, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createWorldIdIdentityVerifier } from "./identity-verifier.world-id";

test("cloud timeout aborts fetch and consumes the nonce", async () => {
  const db = openDatabase(":memory:");
  try {
    const fetcher = (_url: string | URL | Request, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) throw new Error("Missing timeout signal");
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    const verifier = createWorldIdIdentityVerifier({
      db,
      clock: createMockClock(0),
      ids: createMockIdGenerator(),
      appId: "app_test",
      timeoutMs: 1,
      fetch: fetcher as typeof fetch,
    });
    const { requestId } = await verifier.startRequest("orb");
    const input = {
      requestId,
      action: "sign_in",
      proof: {
        merkleRoot: "root",
        nullifierHash: "human",
        proof: "proof",
        verificationLevel: "orb",
      },
    };
    await expect(verifier.verifyProof(input)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "World ID verification failed. Please start a new request.",
    });
    await expect(verifier.verifyProof(input)).rejects.toThrow(
      "invalid or expired",
    );
  } finally {
    db.close();
  }
});
