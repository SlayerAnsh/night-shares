import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../clock/clock.mock";
import { createMockIdGenerator } from "../ids/id-generator.mock";
import { createRequestStore } from "./request-store.sqlite";

test("pending requests and nonce consumption survive database reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "identity-nonces-"));
  const path = join(directory, "requests.db");
  let db = openDatabase(path);
  const clock = createMockClock(1000);
  const ids = createMockIdGenerator();
  try {
    const request = createRequestStore({ db, clock, ids }).start(
      "orb",
      "check_in",
      "usr_1",
    );
    db.close();
    db = openDatabase(path);
    expect(
      createRequestStore({ db, clock, ids }).consume(
        request.requestId,
        "check_in",
        "usr_1",
      ).signal,
    ).toBe(request.signal);
    db.close();
    db = openDatabase(path);
    expect(() =>
      createRequestStore({ db, clock, ids }).consume(
        request.requestId,
        "check_in",
        "usr_1",
      ),
    ).toThrow("invalid or expired");
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
