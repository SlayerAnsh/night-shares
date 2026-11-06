import { expect, test } from "bun:test";
import { loadConfig } from "./load-config";

test("World ID defaults to mock and validates real configuration at boot", () => {
  expect(loadConfig({})).toMatchObject({
    worldIdMode: "mock",
    worldIdAppId: "",
    worldIdRpId: "",
    worldIdSigningKey: "",
    worldIdEnvironment: "staging",
    worldIdAllowLegacy: true,
    worldIdDeviceCredential: "selfieCheck",
    worldIdAction: "night-shares-enroll",
    worldIdVerifyUrl: "https://developer.world.org/api/v4/verify/{rp_id}",
  });
  expect(() => loadConfig({ WORLD_ID_MODE: "world-id" })).toThrow(
    "WORLD_ID_APP_ID",
  );
  expect(() => loadConfig({ WORLD_ID_MODE: "invalid" })).toThrow(
    "WORLD_ID_MODE",
  );
  expect(() => loadConfig({ WORLD_ID_ENROLL_ACTION: " " })).toThrow(
    "WORLD_ID_ENROLL_ACTION",
  );
  expect(() => loadConfig({ WORLD_ID_VERIFY_URL: "http://localhost" })).toThrow(
    "WORLD_ID_VERIFY_URL",
  );
  expect(
    loadConfig({
      WORLD_ID_MODE: "world-id",
      WORLD_ID_APP_ID: "app_staging_test",
      WORLD_ID_RP_ID: "rp_test",
      WORLD_ID_SIGNING_KEY: "01".repeat(32),
    }).worldIdMode,
  ).toBe("world-id");
});
