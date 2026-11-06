import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerConfig } from "../../config/server-config";

export function rejectRequest(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
) {
  if (res.writableEnded || res.destroyed) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  // Early responses can leave unread request bytes in Bun's HTTP parser.
  // Close the socket after flushing instead of relying only on the header.
  const socket = res.socket;
  res.once("finish", () => socket?.end());
  res.writeHead(status, {
    "content-type": "application/json",
    connection: "close",
  });
  res.end(JSON.stringify({ code, message }));
}

export function applyHttpLimits(
  req: IncomingMessage,
  res: ServerResponse,
  config: ServerConfig,
) {
  if (Number(req.headers["content-length"]) > config.maxRequestBodyBytes) {
    rejectRequest(res, 413, "resource_exhausted", "Request body is too large.");
    return false;
  }
  let bytes = 0;
  const onData = (chunk: Buffer | string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > config.maxRequestBodyBytes) {
      rejectRequest(
        res,
        413,
        "resource_exhausted",
        "Request body is too large.",
      );
      req.pause();
    }
  };
  req.on("data", onData);
  const timer = setTimeout(() => {
    rejectRequest(res, 408, "deadline_exceeded", "Request timed out.");
  }, config.requestTimeoutMs);
  timer.unref();
  const cleanup = () => {
    clearTimeout(timer);
    req.off("data", onData);
  };
  res.once("close", cleanup);
  res.once("finish", cleanup);
  return true;
}
