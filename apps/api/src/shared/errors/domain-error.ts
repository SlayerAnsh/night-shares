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
  ) {
    super(message);
    this.name = "DomainError";
  }
}
