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
  }): Promise<{ nullifier: string; level: VerificationLevel }>;
}
