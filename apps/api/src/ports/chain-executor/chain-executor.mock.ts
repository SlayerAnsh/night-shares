import type {
  ChainExecutor,
  ExecutionRequest,
  ExecutionResult,
} from "./chain-executor";
import { serialize } from "./chain-executor";
/** Existing use cases retain their ledger boundary. New mock command consumers supply that same boundary explicitly. */
export function createMockChainExecutor(
  executeIntent: (request: ExecutionRequest) => Promise<void> = async () => {
    throw new Error("Mock command handler is not integrated.");
  },
): ChainExecutor {
  const operations = new Map<
    string,
    { payload: string; result: Promise<ExecutionResult> }
  >();
  return {
    mode: "mock",
    pending: () => [],
    async execute(request) {
      const payload = serialize(request);
      const existing = operations.get(request.operationId);
      if (existing) {
        if (existing.payload !== payload)
          throw new Error("Operation ID payload mismatch.");
        return existing.result;
      }
      const result = executeIntent(request).then(
        (): ExecutionResult => ({
          operationId: request.operationId,
          fingerprint: "mock",
          state: "finalized",
        }),
      );
      operations.set(request.operationId, { payload, result });
      return result;
    },
    async recover(id) {
      const operation = operations.get(id);
      if (!operation) throw new Error("Unknown mock operation.");
      return operation.result;
    },
  };
}
