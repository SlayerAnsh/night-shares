import { toHex } from "viem";
import { anvilAccount } from "../../src/ports/wallet-custody/wallet-custody.anvil";

const key = anvilAccount(9).getHdKey().privateKey;
if (!key) throw new Error("Missing local fixture key.");
const child = Bun.spawn(["pnpm", "--filter", "api", "dev:fork"], {
  env: {
    ...process.env,
    ARC_NETWORK: "fork",
    CHAIN_STATUS: "onchain",
    WALLET_CUSTODY: "anvil",
    FORK_FAUCET: "true",
    FORK_ATTESTER_KEY: toHex(key),
    ARC_RPC_URL: "http://127.0.0.1:8545",
    DB_PATH: ":memory:",
    PORT: "18787",
    JOB_INTERVAL_MS: "60000",
  },
  stdout: "pipe",
  stderr: "pipe",
});
let serverPid: number | undefined;
try {
  const reader = child.stdout.getReader();
  let output = "";
  while (!serverPid) {
    const chunk = await reader.read();
    if (chunk.done)
      throw new Error("dev:fork exited before announcing its PID.");
    output += new TextDecoder().decode(chunk.value);
    const match = /\{"event":"dev-fork","pid":(\d+)\}/.exec(output);
    if (match) serverPid = Number(match[1]);
  }
  reader.releaseLock();
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch("http://127.0.0.1:18787/readyz");
      if (response.status === 200) {
        console.log("dev:fork /readyz 200");
        break;
      }
    } catch {
      /* Wait for deployment preflight. */
    }
    if (i === 99) throw new Error("dev:fork readiness timed out.");
    await Bun.sleep(100);
  }
} finally {
  if (serverPid) {
    process.kill(serverPid, "SIGTERM");
    console.log(`Stopped dev:fork server PID ${serverPid}`);
  }
  child.kill();
  await child.exited;
}
