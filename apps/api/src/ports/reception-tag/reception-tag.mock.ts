import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReceptionTag } from "./reception-tag";

export function createMockReceptionTag(secret: string) {
  const used = new Map<string, number>();
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
    for (const [value, expires] of used) if (expires < now) used.delete(value);
    if (used.has(payload))
      return { ok: false, reason: "Reception tag has already been used." };
    used.set(payload, at + 300_000);
    return { ok: true, tagId: propertyId };
  };
  return { verify, issueTagPayload };
}
