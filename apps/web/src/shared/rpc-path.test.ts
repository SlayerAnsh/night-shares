import { expect, test } from "bun:test";
import { isRpcPath } from "./rpc-path";

test("allows namespaced Connect service methods", () => {
  expect(
    isRpcPath(["night_shares.identity.v1.IdentityService", "GetSession"]),
  ).toBe(true);
  expect(
    isRpcPath(["night_shares.catalog.v1.CatalogService", "SearchStays"]),
  ).toBe(true);
});
test("rejects traversal, foreign paths and browser token issuance", () => {
  for (const path of [
    [],
    ["healthz"],
    ["night_shares.identity.v1.IdentityService", "CompleteSignIn"],
    ["night_shares.identity.v1.IdentityService", "GetSession", "extra"],
    ["evil.v1.IdentityService", "GetSession"],
    ["night_shares.identity.v1.IdentityService", "../GetSession"],
    ["night_shares.identity.v1.IdentityService", "%2fGetSession"],
    ["https://evil.test", "GetSession"],
  ])
    expect(isRpcPath(path)).toBe(false);
});
