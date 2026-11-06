import {
  CheckpointFailure,
  checkpointFailure,
} from "../../../../ports/agent-pass/failure";
import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import type { Deps } from "../context";
import { executeCheckpoint } from "./execute-checkpoint";

const errors = new Set([
  "access_denied",
  "unmet_authentication_requirements",
  "login_required",
  "expired",
  "cancelled",
  "mismatch",
]);
export async function completeAgentCheckpoint(
  deps: Deps,
  input: {
    state: string;
    code?: string;
    error?: string;
    browser: string;
    iss?: string;
  },
) {
  const { config, store, adapter } = agentPassSettings(deps.ports);
  const a = store.byState(input.state);
  if (!a || !input.browser || a.browser !== input.browser) return "mismatch";
  if (a.status !== "pending" || a.claimed)
    return a.status === "expired" ? "expired" : "mismatch";
  try {
    const user = deps.ports.sessions.get(a.sessionToken ?? "");
    if (!user || user.id !== a.userId || user.level !== "orb")
      throw new CheckpointFailure("mismatch");
    if (input.iss && input.iss !== config.agentPassIssuer)
      throw new CheckpointFailure("mismatch");
    if (input.error)
      throw new CheckpointFailure(
        errors.has(input.error) ? input.error : "access_denied",
      );
    if (!input.code) throw new CheckpointFailure("access_denied");
    const result = await adapter.completeCheckpoint({
      state: a.state,
      code: input.code,
    });
    return executeCheckpoint(deps, user, a, result);
  } catch (error) {
    const reason = checkpointFailure(error);
    const current = store.get(a.id);
    if (current && current.status !== "used") {
      current.status =
        reason === "expired"
          ? "expired"
          : reason === "cancelled"
            ? "cancelled"
            : "denied";
      current.reason = reason;
      current.claimed = true;
      current.sessionToken = undefined;
      current.verifier = "";
      store.save(current);
    }
    return reason === "expired" || reason === "cancelled" ? reason : "denied";
  }
}
