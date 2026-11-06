import { expect, test } from "bun:test";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createWorldIdIdentityVerifier } from "./identity-verifier.world-id";
import { enrollment, jsonProof } from "./world-id-test-fixture";

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
      rpId: "rp_test",
      signingKey: "01".repeat(32),
      timeoutMs: 1,
      fetch: fetcher as typeof fetch,
    });
    const request = await verifier.startRequest("orb");
    const { requestId } = request;
    const input = {
      requestId,
      action: "sign_in",
      proof: jsonProof(enrollment(request)),
    };
    await expect(verifier.verifyProof(input)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "World ID verification was rejected. Please retry.",
    });
    await expect(verifier.verifyProof(input)).rejects.toThrow(
      "invalid or expired",
    );
  } finally {
    db.close();
  }
});
