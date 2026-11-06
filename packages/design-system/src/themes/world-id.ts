// Monochrome World ID look from mock/v2/assets/login.css. Used only by the sign in
// screens. Keys keep the mock --w-* names.

export const worldIdFont = {
  "w-font":
    "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
} as const;

export const worldIdLight = {
  "w-bg": "#F6F6F6",
  "w-surface": "#FFFFFF",
  "w-ink": "#0A0A0A",
  "w-ink-2": "#3C3C3C",
  "w-muted": "#737373",
  "w-line": "#E6E6E6",
  "w-line-2": "#D4D4D4",
  "w-soft": "#F2F2F2",
  "w-btn": "#0A0A0A",
  "w-btn-ink": "#FFFFFF",
  "w-ok": "#0A0A0A",
} as const;

export type WorldIdToken = keyof typeof worldIdLight;

export const worldIdDark = {
  "w-bg": "#000000",
  "w-surface": "#0C0C0C",
  "w-ink": "#FAFAFA",
  "w-ink-2": "#D4D4D4",
  "w-muted": "#8C8C8C",
  "w-line": "#1F1F1F",
  "w-line-2": "#333333",
  "w-soft": "#161616",
  "w-btn": "#FFFFFF",
  "w-btn-ink": "#0A0A0A",
  "w-ok": "#FAFAFA",
} as const satisfies Record<WorldIdToken, string>;
