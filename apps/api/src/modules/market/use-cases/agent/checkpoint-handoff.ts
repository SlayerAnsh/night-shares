import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { Attempt } from "../../../../ports/agent-pass/agent-pass";
import { agentPassSettings } from "../../../../ports/agent-pass/settings";
import { secret } from "../../../../ports/agent-pass/store";
import type { Deps } from "../context";
export function checkpointHandoff(
  deps: Deps,
  a: Attempt,
  sessionToken: string,
  authorizeUrl: string,
) {
  const { config, store } = agentPassSettings(deps.ports);
  a.sessionToken = sessionToken;
  a.handoff = secret();
  a.authorizeUrl = authorizeUrl;
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
