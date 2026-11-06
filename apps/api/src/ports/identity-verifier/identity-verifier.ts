import type { User } from "../sessions/session-store";
export type VerificationLevel = User["level"];
export interface IdentityVerifier {
  startRequest(
    level: VerificationLevel,
  ): Promise<{ requestId: string; qrPayload: string; expiresAt: number }>;
  verifyProof(input: {
    requestId?: string;
    proof: string;
    action: string;
  }): Promise<VerifiedProof>;
}

// subject: stable per app id for one human (like the World ID OIDC `sub`).
// Use it to recognise the same person across sign in and later checks.
// nullifier: per action id; World ID gives a different one for each action,
// so it proves "this human did this action once", not who the human is.
export type VerifiedProof = {
  subject: string;
  nullifier: string;
  level: VerificationLevel;
};
