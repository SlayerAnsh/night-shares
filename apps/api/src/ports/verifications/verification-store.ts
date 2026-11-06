// A fresh World ID check for one sensitive action (check in, large agent
// order). Identity issues the token; the module that runs the action
// consumes it exactly once.
export type VerifiedAction = "check_in" | "approve_agent_order";

export interface VerificationStore {
  issue(input: {
    userId: string;
    action: VerifiedAction;
    resourceId?: string;
  }): {
    token: string;
    expiresAt: number;
  };
  // True only for an unexpired token issued to this user for this action.
  // A consumed token never works again.
  consume(input: {
    token: string;
    userId: string;
    action: VerifiedAction;
    resourceId?: string;
  }): boolean;
}
