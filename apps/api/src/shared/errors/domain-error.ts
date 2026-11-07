import { type ErrorReason, errorReason } from "./reason";
export type DomainErrorCode =
  | "NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "FAILED_PRECONDITION"
  | "PERMISSION_DENIED"
  | "UNAUTHENTICATED"
  | "RESOURCE_EXHAUSTED";
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly reason: ErrorReason | undefined = errorReason(message),
  ) {
    super(message);
    this.name = "DomainError";
  }
}
