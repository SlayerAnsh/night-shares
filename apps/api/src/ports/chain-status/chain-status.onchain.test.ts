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
test("pause cache coalesces reads, combines both contracts, expires and fails closed", async () => {
  let calls = 0;
  let contractCalls = 0;
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
          : `0x${(++contractCalls % 2 === 0 && tokenPaused ? "1" : "0").padStart(64, "0")}`;
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    },
  );
  expect(status.isPaused()).toBe(true);
  expect(await status.readPaused()).toBe(false);
  expect(status.isPaused()).toBe(false);
  expect(await status.readPaused()).toBe(false);
  expect(calls).toBe(3);
  await Bun.sleep(25);
  tokenPaused = true;
  expect(await status.readPaused()).toBe(true);
  expect(calls).toBe(6);
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
  data.abis.NightToken = [
    ...(data.abis.NightToken ?? []),
    ...(data.abis.NightToken ?? []),
  ];
  expect(() => createOnchainChainStatus(data, "http://fork.invalid")).toThrow(
    "unambiguous",
  );
});

test("zero demo token reads hook only; known nights read their own factory token", async () => {
  const { zeroAddress, keccak256, stringToHex } = await import("viem");
  const { executionFixture } = await import("../arc-deployment/fixture");
  const data = executionFixture();
  data.NightToken = zeroAddress;
  const token = "0x1111111111111111111111111111111111111111";
  const requests: { to: string; data: string }[] = [];
  const status = createOnchainChainStatus(
    data,
    "http://fork.invalid",
    5000,
    async (_, init) => {
      const request = JSON.parse(String(init?.body));
      let result = "0x13b2";
      if (request.method === "eth_call") {
        const call = request.params[0];
        requests.push(call);
        expect(call.to).not.toBe(zeroAddress);
        result =
          call.to.toLowerCase() === data.NightFactory.toLowerCase()
            ? `0x${token.slice(2).padStart(64, "0")}`
            : `0x${(call.to === token ? "1" : "0").padStart(64, "0")}`;
      }
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    },
  );
  expect(await status.readPaused()).toBe(false);
  expect(requests).toHaveLength(1);
  expect(status.isPaused("hotel:room:2026-11-07")).toBe(true);
  expect(await status.readPaused("hotel:room:2026-11-07")).toBe(true);
  expect(
    requests.some((r) =>
      r.data.endsWith(keccak256(stringToHex("hotel:room:2026-11-07")).slice(2)),
    ),
  ).toBe(true);
  expect(requests.some((r) => r.to === token)).toBe(true);
  expect(status.isPaused()).toBe(false);
});
