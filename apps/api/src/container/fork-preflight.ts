import { readFileSync } from "node:fs";
import { parseDeployment } from "../ports/arc-deployment/arc-deployment";
import {
  forkClient,
  validateDeployment,
} from "../ports/arc-deployment/validate";

// Run in a bounded subprocess so the existing synchronous container cannot start
// listening before RPC validation completes. No secrets are passed to this process.
try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const fingerprint = await validateDeployment(
    parseDeployment(input.deployment),
    forkClient(input.rpcUrl),
  );
  process.stdout.write(fingerprint);
} catch {
  process.stderr.write(
    "Fork deployment preflight failed (RPC, chain, code, dependency, domain or ABI mismatch).",
  );
  process.exitCode = 1;
}
