// Theme dependent shadows (mock --shadow and --shadow-lg, plus promoted roles).
export const shadowLight = {
  shadow: "0 1px 0 rgba(22,19,31,.04), 0 10px 30px -14px rgba(22,19,31,.22)",
  "shadow-lg": "0 30px 80px -20px rgba(22,19,31,.35)",
  // Active tab of the app switcher (.nav-apps-on). Not a mock variable.
  "shadow-seg-on": "0 1px 2px rgba(22,19,31,.08), 0 0 0 1px var(--line)",
} as const;

export type ShadowToken = keyof typeof shadowLight;

export const shadowDark = {
  shadow: "0 0 0 1px var(--line)",
  "shadow-lg": "0 30px 80px -20px rgba(0,0,0,.7)",
  "shadow-seg-on": "none",
} as const satisfies Record<ShadowToken, string>;

// Theme independent shadows. Hard-coded in the mock, promoted here.
export const shadow = {
  "shadow-focus": "0 0 0 4px var(--accent-soft)", // .input:focus, .input-group
  "shadow-glow": "0 8px 22px -10px #4B1FCB", // .btn-primary
  "shadow-glow-hover": "0 12px 28px -10px #4B1FCB", // .btn-primary:hover
} as const;
