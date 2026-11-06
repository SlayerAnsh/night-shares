import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import { hostIdentity, isHost } from "./trading/host-fees";

export function humanWallets(ports: Ports, user: User, propertyId: string) {
  const rows = ports.db
    .query<{ address: string }, [string]>(
      `SELECT wallet_address AS address FROM market_human_wallets WHERE human_id = ?
     UNION SELECT wallet_address FROM identity_users WHERE human_id = ?1
     UNION SELECT address FROM market_agent_wallets WHERE human_id = ?1`,
    )
    .all(user.humanId);
  const wallets = new Set([user.walletAddress, ...rows.map((r) => r.address)]);
  for (const wallet of [...wallets])
    if (!wallet.startsWith("agent:")) wallets.add(`agent:${wallet}`);
  if (isHost(ports, propertyId, user))
    wallets.add(hostIdentity(ports, propertyId).walletAddress);
  return wallets;
}
