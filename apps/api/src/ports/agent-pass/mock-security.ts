export function assertMockSecurity(config: {
  adapters?: string;
  worldIdMode?: string;
  walletCustody?: string;
  agentPassMode?: string;
  agentApproval?: string;
}) {
  if ((config.adapters ?? "mock") === "mock") return;
  if ((config.worldIdMode ?? "mock") === "mock")
    throw new Error("WORLD_ID_MODE=mock requires ADAPTERS=mock.");
  if ((config.walletCustody ?? "mock") === "mock")
    throw new Error("WALLET_CUSTODY=mock requires ADAPTERS=mock.");
  if (
    (config.agentPassMode ?? "mock") === "mock" &&
    !(config.agentApproval === "idkit" && config.worldIdMode === "cloud")
  )
    throw new Error(
      "AGENT_PASS_MODE=mock requires ADAPTERS=mock; use oidc with credentials or AGENT_APPROVAL=idkit with WORLD_ID_MODE=cloud.",
    );
}
