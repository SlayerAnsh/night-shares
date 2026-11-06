import { describe, expect, test } from "bun:test";
import { buildCss, darkVars, lightVars, staticVars } from "./build-css";

// Every custom property defined in mock/v2/assets/styles.css and login.css.
const mockVars = [
  "bg",
  "surface",
  "surface-2",
  "surface-3",
  "ink",
  "ink-2",
  "muted",
  "line",
  "line-2",
  "accent",
  "accent-soft",
  "grad",
  "pos",
  "pos-soft",
  "neg",
  "neg-soft",
  "warn",
  "r-sm",
  "r",
  "r-lg",
  "shadow",
  "shadow-lg",
  "display",
  "sans",
  "mono",
  "nav-h",
  "w-bg",
  "w-surface",
  "w-ink",
  "w-ink-2",
  "w-muted",
  "w-line",
  "w-line-2",
  "w-soft",
  "w-btn",
  "w-btn-ink",
  "w-ok",
  "w-font",
];

const css = buildCss();

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("buildCss", () => {
  test("keeps every mock variable name", () => {
    for (const name of mockVars) expect(css).toContain(`--${name}: `);
  });

  test("root holds every static and light token with its value", () => {
    const root = block(":root");
    for (const [name, value] of Object.entries({
      ...staticVars,
      ...lightVars,
    })) {
      expect(root).toContain(`--${name}: ${value};`);
    }
    expect(root).toContain("color-scheme: light;");
  });

  test("dark theme is set by attribute and by system preference", () => {
    for (const selector of [
      '[data-theme="dark"]',
      ':root:not([data-theme="light"])',
    ]) {
      const dark = block(selector);
      for (const [name, value] of Object.entries(darkVars))
        expect(dark).toContain(`--${name}: ${value};`);
      expect(dark).toContain("color-scheme: dark;");
    }
    expect(css).toContain("@media (prefers-color-scheme: dark) {");
  });

  test("light and dark define the same theme tokens", () => {
    expect(Object.keys(darkVars).sort()).toEqual(Object.keys(lightVars).sort());
  });

  test("emits shared keyframes", () => {
    expect(css).toContain("@keyframes fade");
    expect(css).toContain("@keyframes rise");
  });
});
