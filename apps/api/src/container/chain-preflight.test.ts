import { expect, test } from "bun:test";
import { preflightFingerprint } from "./chain-preflight";

test("startup error retains the redacted subprocess reason", () => {
  const secret = "foundation-rpc-secret-123456";
  const url = `https://rpc.invalid/${secret}`;
  let message = "";
  try {
    preflightFingerprint(
      {
        status: 1,
        stdout: "",
        stderr: `domain NightToken 0x0000: returned no data\n${url} ${secret}`,
      },
      [url],
    );
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).toContain(
    "API startup refused: domain NightToken 0x0000: returned no data",
  );
  expect(message).not.toContain(secret);
  expect(message).not.toContain("\n");
});

test("preflight handles process failures and invalid fingerprints", () => {
  expect(() =>
    preflightFingerprint(
      {
        status: null,
        stdout: null,
        stderr: null,
        error: new Error("spawn ETIMEDOUT"),
      },
      [],
    ),
  ).toThrow("ETIMEDOUT");
  expect(() =>
    preflightFingerprint(
      {
        status: 0,
        stdout: "invalid",
        stderr: "",
      },
      [],
    ),
  ).toThrow("invalid or missing fingerprint");
  expect(
    preflightFingerprint(
      {
        status: 0,
        stdout: "a".repeat(64),
        stderr: "",
      },
      [],
    ),
  ).toBe("a".repeat(64));
});
