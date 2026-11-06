import type {
  WorldIdMode,
  WorldIdProof,
} from "@night-shares/proto/identity/v1/identity_pb";
import type { User } from "../sessions/session-store";
export type VerificationLevel = User["level"];
export type IdentityProof = string | Omit<WorldIdProof, "$typeName">;
export type IdentityRequest = {
  requestId: string;
  qrPayload: string;
  expiresAt: number;
  appId: string;
  action: string;
  signal: string;
  mode: WorldIdMode;
};
export interface IdentityVerifier {
  startRequest(
    level: VerificationLevel,
    purpose?: string,
    userId?: string,
  ): Promise<IdentityRequest>;
  verifyProof(input: {
    requestId?: string;
    proof: IdentityProof;
    action: string;
    userId?: string;
  }): Promise<VerifiedProof>;
}

// One fixed action makes the nullifier the stable human subject.
export type VerifiedProof = {
  subject: string;
  nullifier: string;
  level: VerificationLevel;
};
