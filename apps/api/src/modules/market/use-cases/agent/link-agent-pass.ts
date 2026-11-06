import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { LinkAgentPassRequest } from "@night-shares/proto/market/v1/market_pb";
import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import type { User } from "../../../../ports/sessions/session-store";
import { DomainError } from "../../../../shared/errors/domain-error";
import { verifyCanonicalAction } from "../../../identity/use-cases/verify-canonical-action";
import type { Deps } from "../context";
import { checkpointHandoff } from "./checkpoint-handoff";
export async function linkAgentPass(
  deps: Deps,
  user: User,
  input: LinkAgentPassRequest,
  token: string,
) {
  const { config, store, adapter } = agentPassSettings(deps.ports);
  if (user.level !== "orb" || deps.ports.sessions.get(token)?.id !== user.id)
    throw new DomainError("UNAUTHENTICATED", "Sign in to link Agent Pass.");
  if (store.link(user.id))
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Agent Pass is already linked.",
    );
  if (!input.requestId) {
    const request = await deps.ports.identityVerifier.startRequest(
      "orb",
      "link_agent_pass",
      user.id,
      { resourceId: user.id },
    );
    return {
      verification: {
        ...request,
        expiresAt: timestampFromMs(request.expiresAt),
      },
    };
  }
  const proof =
    input.proof.case === "mockProof"
      ? input.proof.value
      : {
          idkitResultJson:
            input.proof.case === "idkitResultJson" ? input.proof.value : "",
        };
  const verified = await verifyCanonicalAction(
    deps.ports,
    user,
    "link_agent_pass",
    proof,
    input.requestId,
  );
  if (verified.level !== "orb" || verified.resourceId !== user.id)
    throw new DomainError(
      "PERMISSION_DENIED",
      "A fresh Proof of Human for this account is required.",
    );
  const result = await adapter.startCheckpoint({
    userId: user.id,
    orderId: "",
    acr: config.agentPassAcr,
    returnTo: config.agentPassRedirectUri,
  });
  const a = store.get(result.attemptId);
  if (!a) throw new Error("Checkpoint was not saved.");
  a.allowEnrollment = true;
  return { checkpoint: checkpointHandoff(deps, a, token, result.authorizeUrl) };
}
