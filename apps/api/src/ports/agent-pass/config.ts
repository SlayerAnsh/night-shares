export type AgentPassConfig = {
  agentApproval?: "agent-pass" | "idkit";
  agentPassMode?: "mock" | "oidc";
  agentPassIssuer?: string;
  agentPassClientId?: string;
  agentPassClientSecret?: string;
  agentPassRedirectUri?: string;
  agentPassAcr?: string;
  webOrigin?: string;
};
export function agentPassConfig(env: Record<string, string | undefined>) {
  const agentApproval = env.AGENT_APPROVAL ?? "agent-pass";
  const agentPassMode = env.AGENT_PASS_MODE ?? "mock";
  if (agentApproval !== "agent-pass" && agentApproval !== "idkit")
    throw new Error("AGENT_APPROVAL must be agent-pass or idkit.");
  if (agentPassMode !== "mock" && agentPassMode !== "oidc")
    throw new Error("AGENT_PASS_MODE must be mock or oidc.");
  const result = {
    agentApproval,
    agentPassMode,
    agentPassIssuer: env.AGENT_PASS_ISSUER ?? "https://auth.world.org",
    agentPassClientId: env.AGENT_PASS_CLIENT_ID ?? "",
    agentPassClientSecret: env.AGENT_PASS_CLIENT_SECRET ?? "",
    agentPassRedirectUri:
      env.AGENT_PASS_REDIRECT_URI ??
      "http://localhost:8787/agent-pass/callback",
    agentPassAcr: env.AGENT_PASS_ACR ?? "https://world.org/oidc/acr/orb",
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:3000",
  } satisfies AgentPassConfig;
  for (const [key, value] of [
    ["AGENT_PASS_ISSUER", result.agentPassIssuer],
    ["AGENT_PASS_REDIRECT_URI", result.agentPassRedirectUri],
    ["WEB_ORIGIN", result.webOrigin],
  ]) {
    try {
      const url = new URL(value as string);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash ||
        url.search ||
        (agentPassMode === "oidc" && url.protocol !== "https:")
      )
        throw new Error();
      if (key === "WEB_ORIGIN" && url.pathname !== "/") throw new Error();
      if (
        key === "AGENT_PASS_REDIRECT_URI" &&
        url.pathname !== "/agent-pass/callback"
      )
        throw new Error();
    } catch {
      throw new Error(
        `${key} must be a valid ${agentPassMode === "oidc" ? "HTTPS " : ""}URL with the expected path.`,
      );
    }
  }
  if (result.agentPassAcr !== "https://world.org/oidc/acr/orb")
    throw new Error("AGENT_PASS_ACR must be https://world.org/oidc/acr/orb.");
  if (
    agentPassMode === "oidc" &&
    (!result.agentPassClientId.trim() || !result.agentPassClientSecret.trim())
  )
    throw new Error(
      "AGENT_PASS_CLIENT_ID and AGENT_PASS_CLIENT_SECRET are required in oidc mode.",
    );
  return result;
}
