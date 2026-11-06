import type { Database } from "bun:sqlite";
import { createHmac, timingSafeEqual } from "node:crypto";
import { transaction } from "../../db/transaction";
import type { ReceptionTag } from "./reception-tag";

export function createMockReceptionTag(secret: string, db: Database) {
  function signature(propertyId: string, issuedAt: string) {
    const key = createHmac("sha256", secret).update(propertyId).digest();
    return createHmac("sha256", key)
      .update(`${propertyId}.${issuedAt}`)
      .digest("hex");
  }
  function issueTagPayload(propertyId: string, now: number) {
    return `${propertyId}.${now}.${signature(propertyId, String(now))}`;
  }
  const verify: ReceptionTag["verify"] = ({ payload, propertyId, now }) => {
    const parts = /^(.*)\.(\d+)\.([a-f0-9]{64})$/.exec(payload);
    if (!parts || parts[1] !== propertyId)
      return {
        ok: false,
        reason: "Reception tag does not match this property.",
      };
    const issuedAt = parts[2] ?? "";
    const at = Number(issuedAt);
    if (
      !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(now) ||
      at > now ||
      now - at > 300_000
    )
      return {
        ok: false,
        reason: "Reception tag has expired or is not yet valid.",
      };
    if (
      !timingSafeEqual(
        Buffer.from(parts[3] ?? "", "hex"),
        Buffer.from(signature(propertyId, issuedAt), "hex"),
      )
    )
      return { ok: false, reason: "Reception tag signature is invalid." };
    return transaction(db, () => {
      const consumed = db
        .query(
          "INSERT INTO reception_tag_uses (payload) VALUES (?) ON CONFLICT DO NOTHING",
        )
        .run(payload);
      if (consumed.changes === 0)
        return {
          ok: false as const,
          reason: "Reception tag has already been used.",
        };
      const tagUid = `mock:${propertyId}`;
      const row = db
        .query<{ counter: bigint }, [string]>(
          "INSERT INTO reception_tag_counters (tag_uid, counter) VALUES (?, 1) ON CONFLICT(tag_uid) DO UPDATE SET counter = counter + 1 RETURNING counter",
        )
        .get(tagUid);
      if (!row) throw new Error("Reception tag counter was not saved.");
      return {
        ok: true as const,
        tagId: propertyId,
        tagUid,
        counter: row.counter,
      };
    });
  };
  return { verify, issueTagPayload };
}
