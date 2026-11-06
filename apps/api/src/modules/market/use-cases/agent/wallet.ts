import { create } from "@bufbuild/protobuf";
import { AgentWalletSchema } from "@night-shares/proto/market/v1/market_pb";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { fromProto, toProto } from "../../../../shared/night-key";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import { getPortfolio } from "../account/get-portfolio";
import type { Deps } from "../context";

export async function getAgentWallet(deps: Deps, user: User) {
  const b = agentWallets(deps.ports.db).get(user);
  const purchased = new Map<string, number>();
  for (const o of deps.repo.account(user.humanId).orders.values()) {
    if (o.status !== AgentOrderStatus.EXECUTED || !o.night) continue;
    const key = fromProto(o.night);
    purchased.set(key, (purchased.get(key) ?? 0) + (o.size?.tenths ?? 0));
  }
  const holdings = getPortfolio(deps, user).holdings.flatMap((h) => {
    if (!h.night) return [];
    const size = Math.min(
      h.size?.tenths ?? 0,
      purchased.get(fromProto(h.night)) ?? 0,
    );
    return size ? [{ night: h.night, size: { tenths: size } }] : [];
  });
  return {
    wallet: create(AgentWalletSchema, {
      address: b.address,
      balance: { micros: await deps.ports.walletProvider.balance(b.address) },
      totalBudget: { micros: b.total },
      perOrderCap: { micros: b.per_order },
      spent: { micros: b.spent },
      allowedNights: (JSON.parse(b.allowed) as string[]).map(toProto),
      holdings,
    }),
  };
}

export async function transferAgentWallet(
  deps: Deps,
  user: User,
  amount: bigint,
  withdraw = false,
) {
  if (amount <= 0n || amount > 9223372036854775807n)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Amount must be positive micro USDC.",
    );
  const { address } = agentWallets(deps.ports.db).get(user);
  await deps.ports.walletProvider.settle([
    {
      from: withdraw ? address : user.walletAddress,
      to: withdraw ? user.walletAddress : address,
      amount,
      memo: withdraw ? "withdrawal:agent" : "agent_funding:agent",
    },
  ]);
  if (!withdraw)
    deps.ports.activity.append({
      kind: "agent_wallet_funded",
      actor: "agent",
      userId: user.id,
      nightKey: "",
      propertyId: "",
      tenths: 0,
      priceMicros: amount,
    });
  return getAgentWallet(deps, user);
}
