import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";

import { createLogger } from "../server/logging/logger";
import { redactRpc, registerRpcUrls } from "../shared/redact-url";

registerRpcUrls(
  (process.env.ARC_RPC_URLS ?? process.env.ARC_RPC_URL ?? "")
    .split(",")
    .map((url) => url.trim()),
);
try {
  assertLocalForkRpc(process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545");
  if (process.env.ARC_NETWORK !== "fork")
    throw new Error("dev:fork requires ARC_NETWORK=fork.");
  console.info(JSON.stringify({ event: "dev-fork", pid: process.pid }));
  await import("../main");
} catch (error) {
  createLogger().unexpected(redactRpc(error));
  process.exitCode = 1;
}
