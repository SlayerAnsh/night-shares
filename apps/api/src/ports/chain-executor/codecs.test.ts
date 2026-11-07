import { expect, test } from "bun:test";
import { type Abi, decodeFunctionData } from "viem";
import { parseDeployment } from "../arc-deployment/arc-deployment";
import { fixture } from "../arc-deployment/fixture";
import { requiredAbi } from "../arc-deployment/required-abi";
import {
  type ChainCommand,
  deserialize,
  serialize,
  soliditySeconds,
  tokenTenths,
} from "./chain-executor";
import { calldata, commandCall } from "./codecs";

test("every intent encodes against the reviewed ABI; bigint persistence and units are exact", async () => {
  const d = parseDeployment(fixture());
  d.abis = Object.fromEntries(
    Object.entries(requiredAbi).map(([name, functions]) => [
      name,
      functions.map((f) => JSON.parse(f)) as Abi,
    ]),
  );
  const night = `0x${"11".repeat(32)}` as const;
  const config = {
    F: 1n,
    k: 1n,
    S: 10n ** 18n,
    X: 1n,
    cutoff: 1n,
    host: d.OWNER,
    property: night,
    roomType: night,
    night,
    checkIn: 1n,
  };
  const routing = { night, asks: [], hints: [], deadline: 1n };
  const commands: ChainCommand[] = [
    { ...routing, kind: "buy", qty: 1n, maxPaid: 1n },
    { ...routing, kind: "sell", qty: 1n, minReceived: 1n },
    { ...routing, kind: "book", maxPrice: 1n },
    {
      kind: "open",
      propertyId: "p",
      roomTypeId: "r",
      date: "2026-11-08",
      config,
      salt: night,
    },
    { kind: "addChunk", night, fromRoom: 0n, toRoom: 10n },
    { kind: "cancelAll" },
    { kind: "sweep", night },
    { kind: "settleCutoff", night },
    { kind: "pushBatch", night, count: 100n },
    { kind: "claim", night },
    ...(["NightToken", "NightHook", "Settlement"] as const).map((contract) => ({
      kind: "withdrawCredit" as const,
      contract,
      night,
      recipient: d.OWNER,
    })),
    {
      kind: "link",
      humanId: 1n,
      wallet: d.OWNER,
      deadline: 1n,
      signature: "0x",
    },
    {
      kind: "relink",
      humanId: 1n,
      wallet: d.OWNER,
      deadline: 1n,
      signature: "0x",
    },
    { kind: "verifyHuman", humanId: 1n, orb: true },
    {
      kind: "bind",
      property: night,
      hostPayout: d.OWNER,
      deadline: 1n,
      signature: "0x",
    },
    {
      kind: "reportWalk",
      report: {
        reportId: night,
        bookingId: night,
        property: night,
        guest: d.OWNER,
        paid: 1n,
        evidenceHash: night,
        reportedAt: 1n,
        deadline: 1n,
      },
      signature: "0x",
    },
    { kind: "transfer", to: d.OWNER, amount: 1n },
    { kind: "approveUsdc", amount: 1n },
    {
      kind: "approvePermit2",
      router: "TradeRouter",
      amount: 1n,
      expiration: 1,
    },
    { kind: "approveToken", night, amount: 1n },
    { kind: "provisionToken", to: d.OWNER, amount: 1n },
  ];
  for (const command of commands) {
    const call = await commandCall(d, command, async () => d.NightToken);
    expect(
      decodeFunctionData({ abi: call.abi, data: calldata(call) }).functionName,
    ).toBe(call.functionName);
    expect(deserialize<ChainCommand>(serialize(command))).toEqual(command);
  }
  expect(tokenTenths(1)).toBe(100000000000000000n);
  expect(soliditySeconds(1001)).toBe(1n);
  await expect(
    commandCall(
      d,
      { kind: "pushBatch", night, count: 101n },
      async () => d.NightToken,
    ),
  ).rejects.toThrow("1..100");
});
