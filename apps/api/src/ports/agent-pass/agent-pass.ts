export type CheckpointResult = {
  attemptId: string;
  sub: string;
  iss: string;
  acr: string;
  amr: string[];
  authTime: number;
};
export type AgentPass = {
  startCheckpoint(input: {
    userId: string;
    orderId: string;
    worldSub?: string;
    acr: string;
    returnTo: string;
  }): Promise<{ authorizeUrl: string; attemptId: string }>;
  completeCheckpoint(input: {
    state: string;
    code: string;
  }): Promise<CheckpointResult>;
};
export type Attempt = {
  id: string;
  userId: string;
  orderId: string;
  state: string;
  nonce: string;
  verifier: string;
  createdAt: number;
  expiresAt: number;
  acr: string;
  returnTo: string;
  worldSub?: string;
  status: "pending" | "approved" | "denied" | "cancelled" | "expired" | "used";
  reason: string;
  claimed: boolean;
  allowEnrollment: boolean;
  snapshot?: string;
  sessionToken?: string;
  browser?: string;
  handoff?: string;
  authorizeUrl?: string;
};
