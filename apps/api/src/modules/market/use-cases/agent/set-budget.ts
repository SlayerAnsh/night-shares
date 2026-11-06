import type { User } from "../../../../ports/sessions/session-store";
import { agentWallets } from "../../repo/agent-wallets.sqlite";
import type { Deps } from "../context";
import { getAgentWallet } from "./wallet";
export async function setAgentBudget(
  deps: Deps,
  user: User,
  total: bigint,
  perOrder: bigint,
  allowed: string[],
) {
  agentWallets(deps.ports.db).set(user, total, perOrder, allowed);
  return getAgentWallet(deps, user);
}
