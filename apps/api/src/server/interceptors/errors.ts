import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { ErrorInfoSchema } from "@night-shares/proto/common/v1/error_pb";
import {
  DomainError,
  type DomainErrorCode,
} from "../../shared/errors/domain-error";

import type { Logger } from "../logging/logger";

const codes: Record<DomainErrorCode, Code> = {
  NOT_FOUND: Code.NotFound,
  INVALID_ARGUMENT: Code.InvalidArgument,
  FAILED_PRECONDITION: Code.FailedPrecondition,
  PERMISSION_DENIED: Code.PermissionDenied,
  UNAUTHENTICATED: Code.Unauthenticated,
  RESOURCE_EXHAUSTED: Code.ResourceExhausted,
};
export function createErrorsInterceptor(logger?: Logger): Interceptor {
  return (next) => async (request) => {
    try {
      return await next(request);
    } catch (error) {
      if (error instanceof DomainError)
        throw new ConnectError(
          error.message,
          codes[error.code],
          undefined,
          error.reason
            ? [
                {
                  desc: ErrorInfoSchema,
                  value: { reason: error.reason, domain: "night-shares" },
                },
              ]
            : [],
        );
      if (error instanceof ConnectError) throw error;
      logger?.unexpected(error);
      throw new ConnectError("An unexpected error occurred.", Code.Internal);
    }
  };
}

export const errors = createErrorsInterceptor();
