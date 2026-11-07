import { expect, test } from "bun:test";
import { ConnectError } from "@connectrpc/connect";
import { ErrorInfoSchema } from "@night-shares/proto/common/v1/error_pb";
import { createErrorsInterceptor } from "../../server/interceptors/errors";
import { DomainError } from "./domain-error";

const cases = [
  ["Price moved.", "SLIPPAGE"],
  ["Chain operation buy is pending reconciliation.", "PENDING_RECONCILIATION"],
  ["Ask cancellation is pending reconciliation.", "CANCEL_PENDING"],
  ["Chain transaction reverted.", "REVERTED"],
  ["Trading is paused.", "TRADING_PAUSED"],
  ["Per-human cap exceeded.", "CAP_EXCEEDED"],
  ["Not enough trader liquidity.", "LIQUIDITY"],
  ["Insufficient USDC balance.", "INSUFFICIENT_USDC"],
  ["Choose exactly 1 room for 1 night.", "ONE_ROOM_ONE_NIGHT"],
] as const;
for (const [message, reason] of cases) {
  test(`error detail: ${reason}`, async () => {
    const next = createErrorsInterceptor()(() => {
      throw new DomainError("FAILED_PRECONDITION", message);
    });
    try {
      await next({} as Parameters<typeof next>[0]);
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectError);
      const connect = error as ConnectError;
      expect(connect.rawMessage).toBe(message);
      expect(connect.findDetails(ErrorInfoSchema)[0]?.reason).toBe(reason);
    }
  });
}
