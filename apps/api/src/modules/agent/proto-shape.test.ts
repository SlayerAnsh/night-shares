import { expect, test } from "bun:test";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  AgentSchema,
  AgentStatus,
} from "@night-shares/proto/agent/v1/agent_pb";
import { GetAgentWalletRequestSchema } from "@night-shares/proto/market/v1/market_pb";

test("agent settings and balances round trip through protobuf", () => {
  const agent = create(AgentSchema, {
    id: "agent_1",
    name: "Buy the dip",
    templateId: "buy-the-dip",
    status: AgentStatus.ACTIVE,
    statusReason: "Running within limits",
    walletAddress: "0x1000000000000000000000000000000000000000",
    strategy: {
      version: 1,
      markets: {
        propertyIds: ["prop_1"],
        dateFrom: "2026-11-07",
        dateTo: "2026-11-30",
        weekdays: [5, 6],
      },
      entry: { maxPriceVsFairBps: 9000, minHoursToRelease: 24 },
      exit: {
        takeProfitBps: 1000,
        stopLossBps: 500,
        exitHoursBeforeRelease: 12,
      },
      sizing: { maxPerNight: { tenths: 10 }, maxPerTrade: { tenths: 1 } },
    },
    strategyReason: "Buy below fair price",
    totalBudget: { micros: 100_000_000n },
    perOrderCap: { micros: 10_000_000n },
    spent: { micros: 5_000_000n },
    balance: { micros: 95_000_000n },
    value: { micros: 99_000_000n },
    pnl: { micros: -1_000_000n },
    tradeCount: 1,
    allowedNights: [
      { propertyId: "prop_1", roomTypeId: "rt_1", date: "2026-11-20" },
    ],
  });

  expect(fromBinary(AgentSchema, toBinary(AgentSchema, agent))).toEqual(agent);
});

test("agent wallet requests identify an agent and default to the legacy agent", () => {
  expect(GetAgentWalletRequestSchema.field.agentId.number).toBe(1);
  const request = create(GetAgentWalletRequestSchema, { agentId: "agent_1" });
  expect(
    fromBinary(
      GetAgentWalletRequestSchema,
      toBinary(GetAgentWalletRequestSchema, request),
    ).agentId,
  ).toBe("agent_1");
  expect(create(GetAgentWalletRequestSchema).agentId).toBe("");
});
