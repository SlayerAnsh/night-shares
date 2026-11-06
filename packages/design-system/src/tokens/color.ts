// Semantic colors from mock/v2/assets/styles.css. Keys are the mock CSS variable
// names without the leading "--", so porting mock CSS stays mechanical.

export const colorLight = {
  bg: "#F4F1E8",
  surface: "#FFFDF7",
  "surface-2": "#EFEBDF",
  "surface-3": "#E7E2D4",
  ink: "#16131F",
  "ink-2": "#4A4657",
  muted: "#8A8596",
  line: "#E3DDCF",
  "line-2": "#D3CCBB",
  accent: "#3A1FD1",
  "accent-soft": "#ECE8FF",
  grad: "linear-gradient(100deg, #2A14C4 0%, #5422C9 55%, #A63BB8 100%)",
  pos: "#13834F",
  "pos-soft": "#E2F3E9",
  neg: "#C2412D",
  "neg-soft": "#FBE7E2",
  warn: "#B87A0A",
  // Not mock variables. Hard-coded in the mock and promoted to roles here.
  "on-accent": "#FFFFFF", // text on --grad, --accent and the avatar
  scrim: "rgba(14,12,20,.48)", // .modal-bg overlay
  inverse: "#16131F", // .toast background
  "inverse-ink": "#F4F1E8", // .toast text
  "cmdk-scrim": "rgba(22,19,31,.38)", // .cmdk-back, behind the command palette
} as const;

export type ColorToken = keyof typeof colorLight;

export const colorDark = {
  bg: "#0C0B11",
  surface: "#14121B",
  "surface-2": "#1B1924",
  "surface-3": "#24212F",
  ink: "#EEEBF6",
  "ink-2": "#B3AEC2",
  muted: "#736E82",
  line: "#22202C",
  "line-2": "#312D3D",
  accent: "#8B78FF",
  "accent-soft": "#221C44",
  // The mock does not redefine --grad in .theme-dark, so dark keeps the light gradient.
  grad: "linear-gradient(100deg, #2A14C4 0%, #5422C9 55%, #A63BB8 100%)",
  pos: "#2CC07C",
  "pos-soft": "rgba(44,192,124,.12)",
  neg: "#F2604A",
  "neg-soft": "rgba(242,96,74,.12)",
  // styles.css does not redefine --warn in .theme-dark, so dark inherits the light value.
  warn: "#B87A0A",
  "on-accent": "#FFFFFF",
  scrim: "rgba(14,12,20,.48)",
  inverse: "#F4F1E8",
  "inverse-ink": "#16131F",
  "cmdk-scrim": "rgba(0,0,0,.62)",
} as const satisfies Record<ColorToken, string>;
