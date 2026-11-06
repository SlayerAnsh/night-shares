import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import { secret } from "../../../../ports/agent-pass/store";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import type { Deps } from "../context";
import { checkpointSnapshot } from "./snapshot";
export async function startAgentCheckpoint(
  deps: Deps,
  user: User,
  orderId: string,
  sessionToken: string,
) {
  const { config, store, adapter } = agentPassSettings(deps.ports);
  if (config.agentApproval === "idkit") return { useIdkit: true };
  if (
    user.level !== "orb" ||
    deps.ports.sessions.get(sessionToken)?.id !== user.id
  )
    throw new DomainError("UNAUTHENTICATED", "Sign in to approve this order.");
  const expiry = deps.ports.clock.now() + 600_000;
  const snapshot = checkpointSnapshot(deps, user, orderId, expiry);
  const linked = store.link(user.id);
  const result = await adapter.startCheckpoint({
    userId: user.id,
    orderId,
    worldSub: linked?.sub,
    acr: config.agentPassAcr,
    returnTo: config.agentPassRedirectUri,
  });
  const a = store.get(result.attemptId);
  if (!a) throw new Error("Checkpoint was not saved.");
  a.snapshot = checkpointSnapshot(deps, user, orderId, expiry);
  if (a.snapshot !== snapshot)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Order changed. Start approval again.",
    );
  // The reviewed action expires at the earlier of the saved operation and OIDC lifetime.
  a.expiresAt = expiry;
  a.sessionToken = sessionToken;
  a.handoff = secret();
  a.authorizeUrl = result.authorizeUrl;
  store.save(a);
  const url = new URL("/agent-pass/begin", config.agentPassRedirectUri);
  url.searchParams.set("attempt", a.id);
  url.searchParams.set("ticket", a.handoff);
  return {
    authorizeUrl: url.href,
    attemptId: a.id,
    expiresAt: timestampFromMs(a.expiresAt),
    useIdkit: false,
  };
}
