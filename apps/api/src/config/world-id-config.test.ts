import { expect, test } from "bun:test";
import { loadConfig } from "./load-config";

test("World ID defaults to mock and validates real configuration at boot", () => {
  expect(loadConfig({})).toMatchObject({
    worldIdMode: "mock",
    worldIdAppId: "",
    worldIdAction: "night-shares-human",
    worldIdVerifyUrl: "https://developer.world.org/api/v2/verify/{app_id}",
  });
  expect(() => loadConfig({ WORLD_ID_MODE: "world-id" })).toThrow(
    "WORLD_ID_APP_ID",
  );
  expect(() => loadConfig({ WORLD_ID_MODE: "invalid" })).toThrow(
    "WORLD_ID_MODE",
  );
  expect(() => loadConfig({ WORLD_ID_ACTION: " " })).toThrow("WORLD_ID_ACTION");
  expect(() => loadConfig({ WORLD_ID_VERIFY_URL: "http://localhost" })).toThrow(
    "WORLD_ID_VERIFY_URL",
  );
  expect(
    loadConfig({
      WORLD_ID_MODE: "world-id",
      WORLD_ID_APP_ID: "app_staging_test",
    }).worldIdMode,
  ).toBe("world-id");
});
