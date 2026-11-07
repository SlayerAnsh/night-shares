import { expect, test } from "bun:test";
import { executionFixture } from "../ports/arc-deployment/fixture";
import { chainCheck } from "./chain-check";

test("chain check reports readiness, fingerprint and x402 without transactions", async () => {
  const fingerprint = "a".repeat(64);
  const result = await chainCheck(
    { ARC_NETWORK: "testnet" },
    {
      loadDeployment: () => executionFixture(),
      runPreflight: async (input, _client, warn) => {
        expect(input.chainId).toBe(5042002);
        warn?.("domain NightToken: deferred");
        return fingerprint;
      },
    },
  );
  expect(result).toMatchObject({
    status: "ok",
    fingerprint,
    x402Available: true,
    warnings: ["domain NightToken: deferred"],
  });
});

test("chain check redacts failures and configuration errors", async () => {
  const secret = "chain-check-secret-123456789";
  const url = `https://rpc.invalid/${secret}`;
  const result = await chainCheck(
    { ARC_NETWORK: "testnet", ARC_RPC_URL: url },
    {
      loadDeployment: () => executionFixture(),
      runPreflight: async () => {
        throw new Error(`chainId: ${url} ${secret}`);
      },
    },
  );
  expect(result.status).toBe("unavailable");
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.fingerprint).toBeNull();
  expect(await chainCheck({ ARC_NETWORK: "invalid" })).toMatchObject({
    status: "unavailable",
    x402Available: null,
  });
});
