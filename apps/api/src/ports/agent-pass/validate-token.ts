import { type JWTVerifyGetKey, jwtVerify } from "jose";
import type { Clock } from "../clock/clock";
import type { Attempt, CheckpointResult } from "./agent-pass";
import { CheckpointFailure } from "./failure";
export async function validateToken(
  token: string,
  key: JWTVerifyGetKey,
  a: Attempt,
  policy: { issuer: string; clientId: string; clock: Clock },
): Promise<CheckpointResult> {
  const now = policy.clock.now();
  const { payload: p } = await jwtVerify(token, key, {
    algorithms: ["RS256"],
    issuer: policy.issuer,
    audience: policy.clientId,
    requiredClaims: ["exp", "iat", "sub", "nonce", "auth_time", "acr", "amr"],
    currentDate: new Date(now),
    clockTolerance: 5,
  });
  if (
    p.nonce !== a.nonce ||
    !p.sub ||
    (p.azp !== undefined && p.azp !== policy.clientId) ||
    (Array.isArray(p.aud) && p.aud.length > 1 && p.azp !== policy.clientId)
  )
    throw new CheckpointFailure("mismatch");
  const amr = p.amr;
  if (
    p.acr !== a.acr ||
    !Array.isArray(amr) ||
    !amr.every((v) => typeof v === "string") ||
    !amr.includes("pop") ||
    ![["pop"], ["pop", "user", "mfa"], ["pop", "face", "user"]].some(
      (methods) =>
        methods.length === amr.length &&
        methods.every((method) => amr.includes(method)),
    )
  )
    throw new CheckpointFailure("unmet_authentication_requirements");
  if (
    typeof p.auth_time !== "number" ||
    !Number.isInteger(p.auth_time) ||
    p.auth_time * 1000 < a.createdAt - 5000 ||
    p.auth_time * 1000 > now + 5000 ||
    typeof p.iat !== "number" ||
    p.iat * 1000 > now + 5000 ||
    typeof p.exp !== "number" ||
    p.exp * 1000 <= now ||
    now >= a.expiresAt
  )
    throw new CheckpointFailure("expired");
  return {
    attemptId: a.id,
    sub: p.sub,
    iss: policy.issuer,
    acr: p.acr,
    amr,
    authTime: p.auth_time,
  };
}
