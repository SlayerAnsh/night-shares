import { readFileSync } from "node:fs";
import { parseDeployment } from "../ports/arc-deployment/arc-deployment";
import {
  chainClient,
  validateDeployment,
} from "../ports/arc-deployment/validate";

// Run in a bounded subprocess so the existing synchronous container cannot start
// listening before RPC validation completes. No secrets are passed to this process.
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const fingerprint = await validateDeployment(
    parseDeployment(input.deployment, input.deployment.chainId),
    chainClient(input.rpcUrls, input.deployment.chainId),
  );
  process.stdout.write(fingerprint);
} catch {
  process.stderr.write(
    "Chain deployment preflight failed (RPC, chain, code, dependency, domain or ABI mismatch).",
  );
  process.exitCode = 1;
}
