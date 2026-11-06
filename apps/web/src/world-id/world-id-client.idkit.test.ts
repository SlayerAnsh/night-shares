import { expect, test } from "bun:test";
import { VerificationLevel } from "@worldcoin/idkit";
import { idkitProof } from "./world-id-client.idkit";

test("IDKit results become structured protobuf proof fields", () => {
  expect(
    idkitProof({
      merkle_root: "root",
      nullifier_hash: "human",
      proof: "proof",
      verification_level: VerificationLevel.Orb,
    }),
  ).toEqual({
    case: "worldId",
    value: {
      $typeName: "night_shares.identity.v1.WorldIdProof",
      merkleRoot: "root",
      nullifierHash: "human",
      proof: "proof",
      verificationLevel: "orb",
    },
  });
});
