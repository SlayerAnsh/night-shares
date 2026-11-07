import { readFileSync } from "node:fs";
import { parseDeployment } from "../ports/arc-deployment/arc-deployment";
import {
  chainClient,
  type ForkClient,
  validateDeployment,
} from "../ports/arc-deployment/validate";
import { redactRpc } from "../shared/redact-url";

export function preflightReason(
  error: unknown,
  rpcUrls: readonly string[] = [],
): string {
  return redactRpc(
    error instanceof Error ? error.message : String(error),
    rpcUrls,
  )
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

export function preflightFingerprint(
  checked: {
    status: number | null;
    stdout: string | null;
    stderr: string | null;
    error?: Error;
    signal?: string | null;
  },
  rpcUrls: readonly string[],
): string {
  if (checked.status !== 0 || !/^[a-f0-9]{64}$/.test(checked.stdout ?? "")) {
    const reason = preflightReason(
      checked.error ??
        (checked.stderr?.trim() ||
          `subprocess status ${checked.status}, signal ${checked.signal}; invalid or missing fingerprint`),
      rpcUrls,
    );
    throw new Error(
      `Chain deployment preflight failed; API startup refused: ${reason}`,
    );
  }
  return checked.stdout as string;
}

export async function runPreflight(
  input: { deployment: unknown; rpcUrls: string[]; chainId: number },
  client?: ForkClient,
  warn: (message: string) => void = console.warn,
): Promise<string> {
  try {
    return await validateDeployment(
      parseDeployment(input.deployment, input.chainId),
      client ?? chainClient(input.rpcUrls, input.chainId),
      (message) => warn(preflightReason(message, input.rpcUrls)),
    );
  } catch (error) {
    throw new Error(preflightReason(error, input.rpcUrls));
  }
}

if (import.meta.main) {
  let rpcUrls: string[] = [];
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    rpcUrls = input.rpcUrls;
    process.stdout.write(
      await runPreflight({
        ...input,
        chainId: input.deployment.chainId,
      }),
    );
  } catch (error) {
    process.stderr.write(
      `Chain deployment preflight failed: ${preflightReason(error, rpcUrls)}\n`,
    );
    process.exitCode = 1;
  }
}
