import type { User } from "../../../../ports/sessions/session-store";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import type { Deps } from "../context";
import { transferAgentWallet } from "./wallet";
export async function fundFixtureAgent(d: Deps & { user: User }) {
  agentWallets(d.ports.db).set(d.user, 10000000000n, 10000000000n, []);
  await transferAgentWallet(d, d.user, 10000000000n);
}
