import type { Ports } from "../../../../container/ports";
import { mockSubjectFor } from "../../../../ports/identity-verifier/identity-verifier.mock";
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { feePayments } from "../../../../shared/fee-payments";

export function hostIdentity(ports: Ports, propertyId: string) {
  const owner = ports.db
    .query<{ id: string }, [string]>(
      "SELECT user_id AS id FROM host_owners WHERE property_id = ?",
    )
    .get(propertyId);
  const demo = ["prop_velana", "prop_ubud", "prop_rive", "prop_alpen"].includes(
    propertyId,
  );
  const humanId = demo ? mockSubjectFor("host") : "";
  const identity = ports.db
    .query<User, [string, string]>(
      `SELECT id, human_id AS humanId, wallet_address AS walletAddress, level FROM identity_users
     WHERE (?1 <> '' AND id = ?1) OR (?2 <> '' AND human_id = ?2) UNION ALL
     SELECT id, human_id AS humanId, wallet_address AS walletAddress, 'orb' AS level FROM market_holders
     WHERE (?1 <> '' AND id = ?1) OR (?2 <> '' AND human_id = ?2) LIMIT 1`,
    )
    .get(owner?.id ?? "", humanId);
  return {
    id: owner?.id ?? identity?.id,
    humanId: identity?.humanId ?? humanId,
    walletAddress: identity?.walletAddress ?? SYSTEM_ADDRESSES.host,
  };
}

export function isHost(ports: Ports, propertyId: string, user: User) {
  const host = hostIdentity(ports, propertyId);
  return (
    (!!host.id && !!user.id && host.id === user.id) ||
    (!!host.humanId && !!user.humanId && host.humanId === user.humanId)
  );
}

export function tradeFeePayments(
  ports: Ports,
  propertyId: string,
  trader: User | string,
  notional: bigint,
  fee: bigint,
  late = false,
) {
  const host = hostIdentity(ports, propertyId);
  const alias =
    typeof trader === "string"
      ? ports.db
          .query<{ humanId: string }, [string]>(
            "SELECT human_id AS humanId FROM market_human_wallets WHERE wallet_address = ?",
          )
          .get(trader.startsWith("agent:") ? trader.slice(6) : trader)
      : undefined;
  const own =
    typeof trader === "string"
      ? [host.walletAddress, `agent:${host.walletAddress}`].includes(trader) ||
        (!!alias?.humanId && !!host.humanId && alias.humanId === host.humanId)
      : isHost(ports, propertyId, trader);
  const payments: { to: string; amount: bigint }[] = feePayments(
    notional,
    fee,
    late,
  );
  const treasury = payments.find((p) => p.to === SYSTEM_ADDRESSES.treasury);
  const share = (notional + 50n) / 100n;
  const amount = treasury && treasury.amount < share ? treasury.amount : share;
  if (treasury) treasury.amount -= amount;
  payments.push({
    to: own ? SYSTEM_ADDRESSES.rebatePool : host.walletAddress,
    amount,
  });
  return payments.filter((p) => p.amount > 0n);
}
