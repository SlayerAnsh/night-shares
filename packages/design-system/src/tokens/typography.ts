// Font stacks keep the mock variable names (--display, --sans, --mono).
// Each family is read from an optional --font-* variable first (set by next/font
// in the web app), then falls back to the plain family name.
export const fontFamily = {
  display: "var(--font-bebas-neue, 'Bebas Neue'), 'Oswald', Impact, sans-serif",
  sans: "var(--font-nunito-sans, 'Nunito Sans'), ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-jetbrains-mono, 'JetBrains Mono'), ui-monospace, SFMono-Regular, monospace",
} as const;

// Every font-size the v2 mock uses, keyed by pixel value ("13.5" becomes --fs-13-5).
// Consolidate into a shorter scale once the mock is approved.
export const fontSize = {
  "8": "8px", // trade sort arrows
  "10": "10px",
  "10.5": "10.5px",
  "11": "11px",
  "11.5": "11.5px",
  "12": "12px",
  "12.5": "12.5px",
  "13": "13px",
  "13.5": "13.5px",
  "14": "14px",
  "14.5": "14.5px",
  "15": "15px", // body
  "16": "16px",
  "17": "17px",
  "18": "18px",
  "19": "19px",
  "20": "20px",
  "21": "21px",
  "22": "22px",
  "24": "24px",
  "25": "25px",
  "26": "26px",
  "28": "28px",
  "30": "30px",
  "32": "32px",
  "34": "34px",
  "36": "36px",
  "38": "38px",
  "40": "40px",
  "42": "42px",
  "44": "44px",
  "48": "48px",
  "52": "52px",
  "56": "56px",
  "64": "64px",
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const;

export const lineHeight = {
  display: ".92", // .display
  tight: "1",
  snug: "1.2",
  normal: "1.45",
  body: "1.5", // body
} as const;

export const letterSpacing = {
  tight: "-.02em",
  display: ".01em",
  label: ".02em",
  eyebrow: ".14em",
} as const;
