import { createServer } from "node:net";
import { assertLocalForkRpc } from "../../../ports/arc-deployment/local-fork";
import { forkClient } from "../../../ports/arc-deployment/validate";

/** Isolate integration mutations at the deployment artifact's recorded block. */
export async function isolatedHostFork(upstream: string, block?: number) {
  assertLocalForkRpc(upstream);
  if (block === undefined) throw new Error("Deployment block is required.");
  const reservation = createServer();
  await new Promise<void>((resolve) =>
    reservation.listen(0, "127.0.0.1", resolve),
  );
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw new Error("No local fork port.");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const rpcUrl = `http://127.0.0.1:${port}`;
  const child = Bun.spawn(
    [
      "anvil",
      "--silent",
      "--port",
      String(port),
      "--chain-id",
      "5042",
      "--fork-url",
      upstream,
      "--fork-block-number",
      String(block),
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  const stop = () => child.kill();
  const client = forkClient(rpcUrl);
  for (let i = 0; i < 100; i++) {
    try {
      await client.getChainId();
      return { rpcUrl, stop };
    } catch {
      await Bun.sleep(100);
    }
  }
  stop();
  throw new Error("Isolated host fork did not start.");
}
