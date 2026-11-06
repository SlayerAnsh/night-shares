import { describe, expect, test } from "bun:test";
import { browseHref } from "./browse-href";

describe("browseHref", () => {
  test("host pages fall back to the landing page", () => {
    expect(browseHref("/host/prop_1")).toBe("/");
  });
  test("private pages fall back to their public app home", () => {
    expect(browseHref("/stay/trips")).toBe("/stay");
    expect(browseHref("/trade/portfolio")).toBe("/trade");
  });
  test("public pages are kept", () => {
    expect(browseHref("/stay/prop_1?ci=2026-12-01")).toBe(
      "/stay/prop_1?ci=2026-12-01",
    );
  });
});
