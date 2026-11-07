import { assertLocalForkRpc } from "../ports/arc-deployment/local-fork";

assertLocalForkRpc(process.env.ARC_RPC_URL ?? "http://127.0.0.1:8545");
if (process.env.ARC_NETWORK !== "fork")
  throw new Error("dev:fork requires ARC_NETWORK=fork.");
console.info(JSON.stringify({ event: "dev-fork", pid: process.pid }));
await import("../main");
