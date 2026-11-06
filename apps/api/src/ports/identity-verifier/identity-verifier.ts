import type {
  WorldIdMode,
  WorldIdProof,
  WorldIdRequest,
} from "@night-shares/proto/identity/v1/identity_pb";
import type { User } from "../sessions/session-store";
export type VerificationLevel = User["level"];
export type IdentityProof =
  | string
  | Omit<WorldIdProof, "$typeName">
  | { idkitResultJson: string };
export type IdentityRequest = {
  requestId: string;
  qrPayload: string;
  expiresAt: number;
  appId: string;
  action: string;
  signal: string;
  mode: WorldIdMode;
  context?: Omit<WorldIdRequest, "$typeName">;
};
export interface IdentityVerifier {
  startRequest(
    level: VerificationLevel,
    purpose?: string,
    userId?: string,
    options?: { sessionId?: string; resourceId?: string },
  ): Promise<IdentityRequest>;
  verifyProof(input: {
    requestId?: string;
    proof: IdentityProof;
    action: string;
    userId?: string;
  }): Promise<VerifiedProof>;
}

// The subject is always the canonical enrollment nullifier, never a session nullifier.
export type VerifiedProof = {
  subject: string;
  sessionId?: string;
  resourceId?: string;
  nullifier: string;
  level: VerificationLevel;
};
