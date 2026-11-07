import { expect, test } from "bun:test";
import { parseAbi } from "viem";
import { parseDeployment } from "../arc-deployment/arc-deployment";
import { fixture } from "../arc-deployment/fixture";
import { createOnchainChainStatus } from "./chain-status.onchain";

const deployment = () => {
  const data = parseDeployment(fixture());
  const abi = parseAbi(["function paused() view returns (bool)"]);
  data.abis.NightHook = abi;
  data.abis.NightToken = abi;
  return data;
};
test("pause cache coalesces reads, reads hook only, expires and fails closed", async () => {
  let calls = 0;
  let fail = false;
  let tokenPaused = false;
  const status = createOnchainChainStatus(
    deployment(),
    "http://fork.invalid",
    20,
    async (_, init) => {
      calls++;
      if (fail) throw new Error("offline");
      const request = JSON.parse(String(init?.body));
      const result =
        request.method === "eth_chainId"
          ? "0x13b2"
          : `0x${(tokenPaused ? "1" : "0").padStart(64, "0")}`;
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    },
  );
  expect(status.isPaused()).toBe(true);
  expect(await status.readPaused()).toBe(false);
  expect(status.isPaused()).toBe(false);
  expect(await status.readPaused()).toBe(false);
  expect(calls).toBe(2);
  await Bun.sleep(25);
  tokenPaused = true;
  expect(await status.readPaused()).toBe(true);
  expect(calls).toBe(4);
  await Bun.sleep(25);
  fail = true;
  await expect(status.readPaused()).rejects.toThrow();
  expect(status.isPaused()).toBe(true);
  const failedCalls = calls;
  expect(await status.readPaused()).toBe(true);
  expect(calls).toBe(failedCalls);
});
test("pause adapter rejects missing or ambiguous view functions", () => {
  expect(() =>
    createOnchainChainStatus(parseDeployment(fixture()), "http://fork.invalid"),
  ).toThrow("unambiguous");
  const data = deployment();
  data.abis.NightHook = [
    ...(data.abis.NightHook ?? []),
    ...(data.abis.NightHook ?? []),
  ];
  expect(() => createOnchainChainStatus(data, "http://fork.invalid")).toThrow(
    "unambiguous",
  );
});

test("global and night pause use NightHook without a demo token", async () => {
  const { executionFixture } = await import("../arc-deployment/fixture");
  const { zeroAddress } = await import("viem");
  const data = executionFixture();
  data.NightToken = zeroAddress;
  const requests: string[] = [];
  const status = createOnchainChainStatus(
    data,
    "http://fork.invalid",
    5000,
    async (_, init) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "eth_call") requests.push(request.params[0].to);
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result:
          request.method === "eth_chainId" ? "0x13b2" : `0x${"0".repeat(64)}`,
      });
    },
  );
  expect(await status.readPaused()).toBe(false);
  expect(await status.readPaused("hotel:room:2026-11-07")).toBe(false);
  expect(
    requests.every(
      (address) => address.toLowerCase() === data.NightHook.toLowerCase(),
    ),
  ).toBe(true);
});
