// Trader app look from mock/v2/assets/trade.css. The mock scopes it to
// `.trade-page`; tokens.css scopes it to `[data-app="trade"]`. It redefines the
// base names (--bg, --accent, --r and so on) and adds --subtle, --accent-btn,
// --info and --w6, which only the trade screens use.

// Theme independent overrides (`.trade-page` block).
export const tradeStatic = {
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  w6: "600", // the one heavy weight the trade screens use
  r: "3px",
} as const;

// `.trade-page:not(.theme-dark)`
export const tradeLight = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  "surface-2": "#FAFAFA",
  "surface-3": "#F0F0F0",
  ink: "#171717",
  "ink-2": "#404040",
  muted: "#5C5C5C",
  subtle: "#737373",
  line: "#E5E5E5",
  "line-2": "#D4D4D4",
  accent: "#5A8263",
  "accent-btn": "#46684F",
  "accent-soft": "rgba(90,130,99,.10)",
  "on-accent": "#FFFFFF",
  pos: "#4F7559",
  "pos-soft": "rgba(90,130,99,.12)",
  neg: "#C62A2F",
  "neg-soft": "rgba(198,42,47,.08)",
  warn: "#856A00",
  info: "#2F6DA3",
} as const;

export type TradeToken = keyof typeof tradeLight;

// `.trade-page.theme-dark`
export const tradeDark = {
  bg: "#0A0A0A",
  surface: "#141414",
  "surface-2": "#141414",
  "surface-3": "#1E1E1E",
  ink: "#EDEDED",
  "ink-2": "#C2C2C2",
  muted: "#9A9A9A",
  subtle: "#737373",
  line: "#242424",
  "line-2": "#343434",
  accent: "#6E9A78",
  "accent-btn": "#6E9A78",
  "accent-soft": "rgba(110,154,120,.12)",
  "on-accent": "#0A0A0A",
  pos: "#6E9A78",
  "pos-soft": "rgba(110,154,120,.14)",
  neg: "#E5484D",
  "neg-soft": "rgba(229,72,77,.12)",
  warn: "#D4A72C",
  info: "#6AA6DD",
} as const satisfies Record<TradeToken, string>;
