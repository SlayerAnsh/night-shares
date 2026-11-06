import type { AgentPass } from "./agent-pass";
import { claimCheckpoint } from "./claim";
import { CheckpointFailure } from "./failure";
import type { CheckpointStore } from "./store";
export function createMockAgentPass(
  store: CheckpointStore,
  issuer: string,
): AgentPass {
  return {
    async startCheckpoint(input) {
      const a = store.create(input);
      const url = new URL("/agent-pass/mock", input.returnTo);
      url.searchParams.set("state", a.state);
      return { attemptId: a.id, authorizeUrl: url.href };
    },
    async completeCheckpoint({ state, code }) {
      const a = claimCheckpoint(store, state);
      if (code !== "approve")
        throw new CheckpointFailure(
          code === "cancel" ? "cancelled" : "access_denied",
        );
      return {
        attemptId: a.id,
        sub: a.worldSub ?? `mock:${a.userId}`,
        iss: issuer,
        acr: a.acr,
        amr: ["pop"],
        authTime: a.createdAt / 1000,
      };
    },
  };
}
