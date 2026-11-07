import type { ArcDeployment } from "../ports/arc-deployment/arc-deployment";

export function assertMainnetLimits(
  network: string,
  deployment: ArcDeployment,
): void {
  if (network !== "mainnet") return;
  for (const [key, expected] of Object.entries({
    MAX_F: 1_000_000,
    MAX_POOL: 50_000_000,
    MAX_S: 100,
    MAX_OPEN_NIGHTS: 20,
  })) {
    const actual = deployment.constructorConfig?.[key];
    if (
      (typeof actual !== "number" && typeof actual !== "string") ||
      String(actual) !== String(expected)
    )
      throw new Error(
        `Mainnet deployment constructorConfig.${key} must equal ${expected}.`,
      );
  }
}
