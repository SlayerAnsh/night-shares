"use client";
import { useMutation } from "@connectrpc/connect-query";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { verifyAction } from "@night-shares/proto/identity/v1/identity-IdentityService_connectquery";
import {
  approveAgentOrder,
  createAgentOrder,
} from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { parseMicros, parseTenths } from "../model/market";
import { useAccount } from "./use-account";
import { useUrlState } from "./use-url-state";
export function useAgentOrders(
  night?: Pick<NightKey, "propertyId" | "roomTypeId" | "date">,
) {
  const account = useAccount();
  const { params, update } = useUrlState();
  const seed = params.get("seed") ?? "trader";
  const size = params.get("agentSize") ?? "0.1";
  const budget = params.get("budget") ?? "100";
  const create = useMutation(createAgentOrder),
    verify = useMutation(verifyAction),
    approve = useMutation(approveAgentOrder);
  const tenths = parseTenths(size),
    micros = parseMicros(budget);
  function submit() {
    if (!night || tenths === null || micros === null) return;
    return account.actions.run(
      () => create.mutateAsync({ night, size: { tenths }, budget: { micros } }),
      "trade",
      "Agent order created. Review its status below.",
    );
  }
  function approveOrder(orderId: string) {
    return account.actions.run(
      async () => {
        const result = await verify.mutateAsync({
          action: "approve_agent_order",
          proof: `mock:${seed}:orb`,
        });
        await approve.mutateAsync({
          orderId,
          verificationToken: result.verificationToken,
        });
      },
      "trade",
      "Agent order approved.",
    );
  }
  return {
    account,
    seed,
    size,
    budget,
    update,
    submit,
    approveOrder,
    valid: tenths !== null && micros !== null,
  };
}
