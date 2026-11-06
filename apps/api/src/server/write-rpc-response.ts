import type { ServerResponse } from "node:http";
import { universalResponseToNodeResponse } from "@connectrpc/connect-node";

export async function writeRpcResponse(
  response: Parameters<typeof universalResponseToNodeResponse>[0],
  res: ServerResponse,
) {
  let completed = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      completed = resolve;
      // ServerResponse finishes with "finish" on Node; some Bun versions also
      // emit "end". Do not leave shutdown waiting on a runtime-specific event.
      res.once("finish", completed);
      res.once("close", completed);
      void universalResponseToNodeResponse(response, res).then(resolve, reject);
    });
  } finally {
    res.off("finish", completed);
    res.off("close", completed);
  }
}
