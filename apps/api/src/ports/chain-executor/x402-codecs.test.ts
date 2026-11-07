import { expect, test } from "bun:test";
import { decodeFunctionData, type Hex } from "viem";
import { executionFixture } from "../arc-deployment/fixture";
import type { Authorization, ChainCommand } from "./chain-executor";
import { calldata, commandCall } from "./codecs";

const d = executionFixture();
const night = `0x${"11".repeat(32)}` as Hex;
const salt = `0x${"22".repeat(32)}` as Hex;
const signature = `0x${"33".repeat(32)}${"44".repeat(32)}1b` as Hex;
const auth: Authorization = {
  from: d.OWNER,
  to: d.X402Settler ?? d.OWNER,
  value: 123n,
  validAfter: 0n,
  validBefore: 100n,
  nonce: night,
};
const base = { auth, signature, night, hints: [], deadline: 99n, salt };

test("x402 buy and sell target settler with authorization, trade terms and salt last", async () => {
  for (const command of [
    { ...base, kind: "x402Buy", qty: 5n, asks: [] },
    { ...base, kind: "x402Sell", minReceived: 9n },
  ] satisfies ChainCommand[]) {
    const call = await commandCall(d, command, async () => d.NightToken);
    expect(call.address === d.X402Settler).toBe(true);
    const decoded = decodeFunctionData({ abi: call.abi, data: calldata(call) });
    expect(decoded.functionName).toBe(
      command.kind === "x402Buy" ? "buy" : "sell",
    );
    expect(decoded.args?.[0]).toEqual(auth);
    expect(decoded.args?.[1]).toBe(signature);
    expect(decoded.args?.at(-1)).toBe(salt);
    expect(decoded.args?.[3]).toBe(command.kind === "x402Buy" ? 5n : 9n);
  }
});

test("authorizedTransfer uses token v,r,s overload for USDC and NightToken", async () => {
  for (const token of [d.USDC, d.NightToken]) {
    const call = await commandCall(
      d,
      { kind: "authorizedTransfer", token, auth, signature },
      async () => d.NightToken,
    );
    expect(call.address).toBe(token);
    const decoded = decodeFunctionData({ abi: call.abi, data: calldata(call) });
    expect(decoded.args).toEqual([
      auth.from,
      auth.to,
      auth.value,
      auth.validAfter,
      auth.validBefore,
      auth.nonce,
      27,
      `0x${"33".repeat(32)}`,
      `0x${"44".repeat(32)}`,
    ]);
  }
});

test("legacy deployment rejects x402 commands before encoding", async () => {
  const legacy = { ...d, x402Available: false, X402Settler: undefined };
  await expect(
    commandCall(
      legacy,
      { ...base, kind: "x402Buy", qty: 5n, asks: [] },
      async () => d.NightToken,
    ),
  ).rejects.toThrow("x402 unavailable");
});
