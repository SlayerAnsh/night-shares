export function chainConfig(env: Record<string, string | undefined>) {
  const chainLimits =
    env.CHAIN_LIMITS ??
    (env.ARC_NETWORK !== "testnet" && env.ADAPTERS === "arc"
      ? "mainnet"
      : "off");
  if (chainLimits !== "mainnet" && chainLimits !== "off")
    throw new Error("CHAIN_LIMITS must be mainnet or off.");
  const paused = env.CHAIN_PAUSED ?? "false";
  if (paused !== "true" && paused !== "false")
    throw new Error("CHAIN_PAUSED must be true or false.");
  const threshold =
    env.AGENT_APPROVAL_THRESHOLD_USDC ??
    (chainLimits === "mainnet" ? "10" : "1000");
  if (!/^\d+(\.\d{1,6})?$/.test(threshold))
    throw new Error(
      "AGENT_APPROVAL_THRESHOLD_USDC must be a nonnegative USDC amount with at most six decimals.",
    );
  const [whole, fraction = ""] = threshold.split(".");
  return {
    chainLimits,
    chainPaused: paused === "true",
    agentApprovalThreshold:
      BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0")),
  };
}
