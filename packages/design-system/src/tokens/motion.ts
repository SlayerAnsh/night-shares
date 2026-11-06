// Transition durations used by the mock, keyed by milliseconds (--dur-150).
export const duration = {
  "80": ".08s", // button press
  "100": ".1s",
  "150": ".15s", // default hover and focus
  "180": ".18s", // switch knob, modal fade
  "200": ".2s", // toast rise
  "220": ".22s", // modal rise
  "250": ".25s", // toast exit
} as const;

export const easing = {
  standard: "ease",
  out: "cubic-bezier(.2,.8,.2,1)", // modal rise
} as const;

// Shared keyframes from styles.css. Emitted into tokens.css as-is.
export const keyframes = {
  fade: "from { opacity: 0 }",
  rise: "from { opacity: 0; transform: translateY(14px) scale(.985) }",
} as const;
