import { expect, test } from "bun:test";
import { loadConfig } from "../../config/load-config";
import { createOnchainChainStatus } from "../chain-status/chain-status.onchain";
import { createOnchainUsdcBalance } from "../wallet-custody/onchain-usdc-balance";
import { anvilAccount } from "../wallet-custody/wallet-custody.anvil";

test.skipIf(process.env.FORK_IT !== "1")(
  "live fork exposes pause state and seeded ERC-20 micro USDC balance",
  async () => {
    const config = loadConfig({
      ARC_NETWORK: "fork",
      ARC_RPC_URL: process.env.ARC_RPC_URL,
      ARC_DEPLOYMENT_FILE: process.env.ARC_DEPLOYMENT_FILE,
    });
    const deployment = config.arcDeployment;
    if (!deployment || !config.arcRpcUrl)
      throw new Error("Missing fork config.");
    const status = createOnchainChainStatus(deployment, config.arcRpcUrl);
    expect(status.isPaused()).toBe(true);
    const paused = await status.readPaused();
    expect(typeof paused).toBe("boolean");
    expect(status.isPaused()).toBe(paused);
    const balance = createOnchainUsdcBalance("fork", config.arcRpcUrl, {
      usdc: deployment.USDC,
    });
    const amount = await balance(anvilAccount(1).address);
    expect(amount).not.toBeNull();
    expect(amount !== null && amount > 0n).toBe(true);
  },
);
