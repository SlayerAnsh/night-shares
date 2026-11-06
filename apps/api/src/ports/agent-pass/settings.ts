import type { Ports } from "../../container/ports";
import type { AgentPass } from "./agent-pass";
import { createMockAgentPass } from "./agent-pass.mock";
import { createOidcAgentPass } from "./agent-pass.oidc";
import { type AgentPassConfig, agentPassConfig } from "./config";
import { checkpointStore } from "./store";

const settings = new WeakMap<Ports, ReturnType<typeof configureAgentPass>>();
export function configureAgentPass(ports: Ports, config: AgentPassConfig) {
  const c = agentPassConfig({
    AGENT_APPROVAL: config.agentApproval,
    AGENT_PASS_MODE: config.agentPassMode,
    AGENT_PASS_ISSUER: config.agentPassIssuer,
    AGENT_PASS_CLIENT_ID: config.agentPassClientId,
    AGENT_PASS_CLIENT_SECRET: config.agentPassClientSecret,
    AGENT_PASS_REDIRECT_URI: config.agentPassRedirectUri,
    AGENT_PASS_ACR: config.agentPassAcr,
    WEB_ORIGIN: config.webOrigin,
  });
  const store = checkpointStore(ports.db, ports.clock, ports.ids);
  const adapter: AgentPass =
    c.agentPassMode === "mock"
      ? createMockAgentPass(store, c.agentPassIssuer)
      : createOidcAgentPass({
          store,
          clock: ports.clock,
          issuer: c.agentPassIssuer,
          clientId: c.agentPassClientId,
          clientSecret: c.agentPassClientSecret,
          redirectUri: c.agentPassRedirectUri,
        });
  const value = { config: c, store, adapter };
  settings.set(ports, value);
  return value;
}
export function agentPassSettings(ports: Ports) {
  const value = settings.get(ports);
  if (!value) throw new Error("Agent Pass is not configured.");
  return value;
}
