import { expect, test } from "bun:test";
import { AgentOrderStatus } from "@night-shares/proto/market/v1/portfolio_pb";
import { fixture } from "../testing/fixture";
import { createAgentOrder } from "../use-cases/account/create-agent-order";
import { postAsk } from "../use-cases/account/post-ask";
import { fundFixtureAgent } from "../use-cases/agent/testing";
import { buy } from "../use-cases/trading/buy";
import { sell } from "../use-cases/trading/sell";

test("agent order fills signed asks only up to the maker's live holding", async () => {
  const d = await fixture();
  try {
    await buy(d, d.user, d.key, 5, 10n ** 12n);
    postAsk(d, d.user, d.key, 5, 1000000n);
    await sell(d, d.user, d.key, 3, 0n);
    const agent = {
      ...d.user,
      id: "usr_agent",
      humanId: "agent-human",
      walletAddress: await d.ports.walletProvider.linkWallet("agent-human"),
    };
    await fundFixtureAgent({ ...d, user: agent });
    const result = await createAgentOrder(d, agent, d.key, 2, 1000000n);
    expect(result.order.status).toBe(AgentOrderStatus.EXECUTED);
    expect(d.repo.position(d.user.humanId, d.key).free).toBe(0);
    expect(d.repo.position(agent.humanId, d.key).free).toBe(2);
  } finally {
    d.ports.db.close();
  }
});
