import { expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../db/open-database";
import { createMockClock } from "../../ports/clock/clock.mock";
import { createMockIdentityVerifier } from "../../ports/identity-verifier/identity-verifier.mock";
import { createMockIdGenerator } from "../../ports/ids/id-generator.mock";
import { createSqliteSessionStore } from "../../ports/sessions/session-store.sqlite";
import { createSqliteWalletProvider } from "../../ports/wallet-provider/wallet-provider.sqlite";
import { createSqliteUserRepo } from "./repo/user-repo.sqlite";
import { createCompleteSignIn } from "./use-cases/sign-in/complete-sign-in";

function identity(db: ReturnType<typeof openDatabase>) {
  const clock = createMockClock(1000);
  const ids = createMockIdGenerator();
  const identityVerifier = createMockIdentityVerifier({ clock, ids });
  const walletProvider = createSqliteWalletProvider({ db, clock, ids });
  const sessions = createSqliteSessionStore({ db, clock });
  const repo = createSqliteUserRepo({ db });
  const complete = createCompleteSignIn({
    ids,
    identityVerifier,
    walletProvider,
    sessions,
    repo,
  });
  return {
    repo,
    sessions,
    walletProvider,
    async signIn(level: "device" | "orb") {
      const { requestId } = await identityVerifier.startRequest(level);
      return complete({ requestId, proof: `mock:alice:${level}` });
    },
  };
}

test("sign-in preserves user, Orb upgrade, wallet and sessions across restarts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "night-shares-identity-"));
  const path = join(directory, "identity.db");
  let db = openDatabase(path);
  try {
    const first = identity(db);
    const device = await first.signIn("device");
    db.close();
    db = openDatabase(path);
    const second = identity(db);
    expect(second.repo.get(device.user.humanId)).toEqual(device.user);
    expect(second.sessions.get(device.sessionToken)).toEqual(device.user);
    const link = spyOn(second.walletProvider, "linkWallet");
    const orb = await second.signIn("orb");
    expect(orb.user).toEqual({ ...device.user, level: "orb" });
    expect(link).not.toHaveBeenCalled();
    db.close();
    db = openDatabase(path);
    const third = identity(db);
    expect(third.repo.get(orb.user.humanId)).toEqual(orb.user);
    expect(third.sessions.get(orb.sessionToken)).toEqual(orb.user);
    const relink = spyOn(third.walletProvider, "linkWallet");
    expect((await third.signIn("device")).user).toEqual(orb.user);
    expect(relink).not.toHaveBeenCalled();
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
