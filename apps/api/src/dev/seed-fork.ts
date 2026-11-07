import { buildContainer, type Container } from "../container/build-container";
import { seedConfig as chainSeedConfig, seedChain } from "./seed-chain";

export function seedConfig(env = process.env) {
  if (env.ARC_NETWORK && env.ARC_NETWORK !== "fork")
    throw new Error("seed:fork requires ARC_NETWORK=fork.");
  return chainSeedConfig({
    ...env,
    ARC_NETWORK: "fork",
    WALLET_CUSTODY: "anvil",
  });
}
export const seedFork = (container: Container) =>
  seedChain(container, {
    arcNetwork: "fork",
    walletCustody: "anvil",
    port: 8787,
    adapters: "mock",
  });
if (import.meta.main) {
  const container = buildContainer(seedConfig());
  try {
    console.info(JSON.stringify(await seedFork(container), null, 2));
  } finally {
    container.ports.db.close();
  }
}
