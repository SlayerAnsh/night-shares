import { expect, test } from "bun:test";
import { linkEnrollment } from "../../../ports/identity-verifier/link-enrollment";
import { createWorldIdState } from "../../../ports/identity-verifier/world-id-state";
import { isWalkBanned } from "../repo/bans";
import { fixture } from "../testing/fixture";
import { handleReport } from "./handle-report";
import { markWalkFalse } from "./mark-false";

async function reportedGuest() {
  const f = await fixture();
  f.cases.tapReception(
    f.trip.id,
    f.cases.issueReceptionTag(f.trip.id, f.user.id).tagPayload,
    f.user.id,
  );
  await handleReport(f.ports, f.report);
  f.ports.db
    .query("INSERT INTO identity_users VALUES (?, ?, 'device', ?)")
    .run(f.user.humanId, f.user.id, f.user.walletAddress);
  const state = createWorldIdState(f.ports.db);
  state.link(f.user.humanId, "session_selfie", "device");
  return { ...f, state };
}

test("false reports ban every linked identifier and reject reports through every alias", async () => {
  const f = await reportedGuest();
  try {
    linkEnrollment(f.ports.db, "orb", "orb", f.user.id);
    f.state.link("orb", "session_orb", "orb");
    f.ports.db
      .query("INSERT INTO world_id_enrollments VALUES ('older', ?, 'device')")
      .run(f.user.humanId);
    markWalkFalse(f.ports, f.report.id);
    markWalkFalse(f.ports, f.report.id);
    expect(
      f.ports.db
        .query("SELECT human_id FROM walk_bans ORDER BY human_id")
        .all(),
    ).toEqual([
      { human_id: "guest" },
      { human_id: "older" },
      { human_id: "orb" },
    ]);
    for (const humanId of ["guest", "older", "orb"]) {
      await expect(
        handleReport(f.ports, { ...f.report, humanId }),
      ).rejects.toThrow("banned for this World ID");
    }
    expect(isWalkBanned(f.ports.db, "unrelated")).toBe(false);
  } finally {
    f.ports.db.close();
  }
});

for (const banned of [["guest"], ["orb"], ["guest", "orb"], ["older"]]) {
  test(`enrollment inherits existing bans on ${banned.join(" and ")}`, async () => {
    const f = await reportedGuest();
    try {
      f.ports.db
        .query(
          "INSERT INTO world_id_enrollments VALUES ('older', 'guest', 'device')",
        )
        .run();
      for (const id of banned) {
        f.ports.db
          .query("INSERT INTO walk_bans VALUES (?, ?, 1)")
          .run(id, f.report.id);
      }
      linkEnrollment(f.ports.db, "orb", "orb", f.user.id);
      f.state.link("orb", "session_orb", "orb");
      expect(f.state.link("guest", "session_recovery", "device")).toBe("orb");
      for (const humanId of ["guest", "older", "orb"]) {
        expect(isWalkBanned(f.ports.db, humanId)).toBe(true);
        await expect(
          handleReport(f.ports, { ...f.report, humanId }),
        ).rejects.toThrow("banned for this World ID");
      }
      for (const id of banned) {
        expect(
          f.ports.db
            .query("SELECT 1 FROM walk_bans WHERE human_id = ?")
            .get(id),
        ).not.toBeNull();
      }
    } finally {
      f.ports.db.close();
    }
  });
}

test("fresh enrollment and session recovery retain a preexisting nullifier ban", async () => {
  const f = await fixture();
  try {
    f.ports.db
      .query("INSERT INTO walk_bans VALUES ('returning', 'old_report', 1)")
      .run();
    const state = createWorldIdState(f.ports.db);
    for (const level of ["device", "orb"] as const) {
      const humanId = state.link("returning", `session_${level}`, level);
      expect(isWalkBanned(f.ports.db, humanId)).toBe(true);
      await expect(
        handleReport(f.ports, { ...f.report, humanId }),
      ).rejects.toThrow("banned for this World ID");
    }
  } finally {
    f.ports.db.close();
  }
});
