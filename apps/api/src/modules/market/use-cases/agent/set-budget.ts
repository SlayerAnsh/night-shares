import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { chainMarket, isChain } from "../../chain/runtime";
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
  if (
    isChain(deps.ports) &&
    deps.ports.db
      .query(
        "SELECT 1 FROM market_chain_intents WHERE fingerprint = ? AND human_id = ? AND agent = 1 AND state = 'pending'",
      )
      .get(chainMarket(deps.ports).reader.fingerprint, user.humanId)
  )
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Agent budget has a pending chain reservation.",
    );
  agentWallets(deps.ports.db).set(user, total, perOrder, allowed);
  return getAgentWallet(deps, user);
}
