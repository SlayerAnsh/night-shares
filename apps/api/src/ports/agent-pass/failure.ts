export class CheckpointFailure extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
export function checkpointFailure(error: unknown) {
  return error instanceof CheckpointFailure ? error.reason : "access_denied";
}
