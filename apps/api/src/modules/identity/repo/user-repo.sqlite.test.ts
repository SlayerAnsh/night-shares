import { expect, test } from "bun:test";
import { openDatabase } from "../../../db/open-database";
import { transaction } from "../../../db/transaction";
import type { User } from "../../../ports/sessions/session-store";
import { createSqliteUserRepo } from "./user-repo.sqlite";

test("users are copied, replaced by human ID and rolled back with an outer transaction", () => {
  const db = openDatabase(":memory:");
  try {
    const repo = createSqliteUserRepo({ db });
    const user: User = {
      id: "usr_alice",
      humanId: "alice",
      level: "device",
      walletAddress: "wallet_alice",
    };
    expect(repo.get(user.humanId)).toBeUndefined();
    repo.save(user);
    user.level = "orb";
    expect(repo.get(user.humanId)?.level).toBe("device");
    repo.save(user);
    const saved = repo.get(user.humanId);
    expect(saved).toEqual(user);
    if (saved) saved.walletAddress = "changed";
    expect(repo.get(user.humanId)).toEqual(user);
    expect(() =>
      transaction(db, () => {
        repo.save({ ...user, walletAddress: "replacement" });
        repo.save({ ...user, humanId: "bob" });
        throw new Error("reject users");
      }),
    ).toThrow("reject users");
    expect(repo.get(user.humanId)).toEqual(user);
    expect(repo.get("bob")).toBeUndefined();
  } finally {
    db.close();
  }
});
