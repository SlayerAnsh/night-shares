import { VerificationLevel } from "@night-shares/proto/identity/v1/user_pb";
export type AccessLevel = "device" | "orb";
export function sessionLevel(
  level: VerificationLevel | undefined,
): AccessLevel | null {
  if (level === VerificationLevel.ORB) return "orb";
  return level === VerificationLevel.DEVICE ? "device" : null;
}
export function canAccess(level: AccessLevel | null, need: AccessLevel) {
  return level === "orb" || (level === "device" && need === "device");
}
export function loginHref(next: string, why: string, need: AccessLevel) {
  return `/login?${new URLSearchParams({ next, why, need })}`;
}
