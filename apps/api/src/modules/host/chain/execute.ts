import type { Ports } from "../../../container/ports";
import {
  deserialize,
  type ExecutionRequest,
  serialize,
} from "../../../ports/chain-executor/chain-executor";
import { DomainError } from "../../../shared/errors/domain-error";

export function chainPorts(
  ports: Pick<Ports, "chainExecutor" | "chainReader" | "chainAttester">,
) {
  const {
    chainExecutor: executor,
    chainReader: reader,
    chainAttester: attester,
  } = ports;
  if (!executor || executor.mode === "mock" || !reader || !attester)
    throw new DomainError(
      "FAILED_PRECONDITION",
      "Chain execution and attestation are required.",
    );
  return { executor, reader, attester };
}

export class RevertedHostOperation extends DomainError {
  constructor() {
    super(
      "FAILED_PRECONDITION",
      "Chain opening reverted; no inventory was created.",
    );
  }
}

/** Persist signed attestations before execution so retries preserve the original payload. */
export async function executeIntent(
  ports: Ports,
  id: string,
  prepare: () => Promise<ExecutionRequest>,
) {
  const { executor, reader } = chainPorts(ports);
  const operationId = `${reader.fingerprint}:host:${id}`;
  let saved = ports.db
    .query<{ request: string }, [string]>(
      "SELECT request FROM host_chain_intents WHERE id = ?",
    )
    .get(operationId);
  if (!saved) {
    const request = { ...(await prepare()), operationId };
    ports.db
      .query("INSERT OR IGNORE INTO host_chain_intents VALUES (?, ?)")
      .run(operationId, serialize(request));
    saved = ports.db
      .query<{ request: string }, [string]>(
        "SELECT request FROM host_chain_intents WHERE id = ?",
      )
      .get(operationId);
  }
  if (!saved) throw new Error("Missing durable chain intent.");
  const result = await executor.execute(
    deserialize<ExecutionRequest>(saved.request),
  );
  if (result.state === "reverted") throw new RevertedHostOperation();
  if (result.state !== "finalized" || result.receipt?.status !== "success")
    throw new DomainError(
      "FAILED_PRECONDITION",
      `Chain operation ${result.state}; retry to reconcile ${operationId}.`,
    );
  return result;
}
