import { describe, expect, test } from "bun:test";
import { Code, ConnectError } from "@connectrpc/connect";
import { errorCopy, errorLine, isRetryable } from "./error-copy";

describe("errorCopy", () => {
  test("a missing stay names the stay and hides the code", () => {
    const copy = errorCopy(
      new ConnectError("Property not found.", Code.NotFound),
      "This stay",
    );
    expect(copy.title).toBe("This stay could not be found");
    expect(copy.message).not.toContain("not_found");
    expect(copy.canRetry).toBe(false);
  });

  test("a paused market reads as paused, not as a code", () => {
    const copy = errorCopy(
      new ConnectError("Trading is paused.", Code.FailedPrecondition),
    );
    expect(copy.title).toBe("Trading is paused");
    expect(copy.canRetry).toBe(true);
  });

  test("a prefixed message string maps like the error itself", () => {
    expect(
      errorCopy("[unauthenticated] Sign in to continue.").needsSignIn,
    ).toBe(true);
    expect(errorCopy("[permission_denied] Orb required.").title).toBe(
      "Not open to this account",
    );
  });

  test("a network failure asks to retry", () => {
    const copy = errorCopy(new ConnectError("fetch failed", Code.Unknown));
    expect(copy.code).toBe(Code.Unavailable);
    expect(copy.canRetry).toBe(true);
  });

  test("a plain sentence written for people is kept", () => {
    expect(errorCopy("Listing removed too late.").message).toBe(
      "Listing removed too late.",
    );
  });

  test("a validation message from the API is shown as written", () => {
    expect(
      errorCopy(
        new ConnectError("Pick at least one night.", Code.InvalidArgument),
      ).message,
    ).toBe("Pick at least one night.");
  });

  test("internal errors never leak their text", () => {
    const copy = errorCopy(new ConnectError("sqlite busy", Code.Internal));
    expect(copy.message).not.toContain("sqlite");
  });
});

describe("isRetryable", () => {
  test("not found fails fast and unavailable retries", () => {
    expect(isRetryable(new ConnectError("x", Code.NotFound))).toBe(false);
    expect(isRetryable(new ConnectError("x", Code.Unavailable))).toBe(true);
  });
});

describe("errorLine", () => {
  test("joins title and message for a coded error", () => {
    expect(errorLine("[not_found] Night not found.", "This market")).toBe(
      "This market could not be found. It may have been removed, or the link is not quite right.",
    );
  });

  test("keeps a plain sentence", () => {
    expect(errorLine("Listing removed.")).toBe("Listing removed.");
  });
});
