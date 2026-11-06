import { transaction } from "../../../../db/transaction";
import type { User } from "../../../../ports/sessions/session-store";
import { SYSTEM_ADDRESSES } from "../../../../ports/wallet-provider/wallet-provider";
import { DomainError } from "../../../../shared/errors/domain-error";
import { claimProto, cutoffClaims } from "../../repo/cutoff-claims";
import { type Deps, realise } from "../context";

export function listCutoffClaims(deps: Deps, user: User) {
  return { claims: cutoffClaims(deps.ports.db, user.humanId).map(claimProto) };
}

export async function claimCutoff(deps: Deps, user: User, key: string) {
  const { ports, repo } = deps;
  const row = transaction(ports.db, () => {
    const row = cutoffClaims(ports.db, user.humanId).find(
      (r) => r.night_key === key,
    );
    if (!row)
      throw new DomainError("NOT_FOUND", "No cutoff claim for this night.");
    if (row.busy)
      throw new DomainError(
        "FAILED_PRECONDITION",
        "This cutoff claim is settling.",
      );
    if (row.claimed_at !== null) return row;
    ports.db
      .query(
        "UPDATE market_cutoff_claims SET busy = 1, claimed_at = ? WHERE night_key = ? AND human_id = ?",
      )
      .run(ports.clock.now(), key, user.humanId);
    return row;
  });
  if (row.claimed_at !== null)
    return { claim: claimProto(row), alreadyClaimed: true };
  try {
    await ports.walletProvider.settle(
      row.amount
        ? [
            {
              from: SYSTEM_ADDRESSES.cutoffClaims,
              to: user.walletAddress,
              amount: row.amount,
              memo: "cutoff claim",
            },
          ]
        : [],
    );
  } catch (error) {
    transaction(ports.db, () => {
      ports.db
        .query(
          "UPDATE market_cutoff_claims SET busy = 0, claimed_at = NULL WHERE night_key = ? AND human_id = ?",
        )
        .run(key, user.humanId);
    });
    throw error;
  }
  transaction(ports.db, () => {
    row.claimed_at = BigInt(ports.clock.now());
    ports.db
      .query(
        "UPDATE market_cutoff_claims SET busy = 0, claimed_at = ? WHERE night_key = ? AND human_id = ?",
      )
      .run(row.claimed_at, key, user.humanId);
    const position = repo.position(user.humanId, key);
    position.average = row.average;
    realise(position, Number(row.size), row.amount);
    ports.activity.append({
      nightKey: key,
      propertyId: ports.inventory.get(key).propertyId,
      kind: "cutoff_claimed",
      actor: "trader",
      userId: user.id,
      tenths: Number(row.size),
    });
  });
  return { claim: claimProto(row), alreadyClaimed: false };
}
