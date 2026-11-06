// max-width media query breakpoints used by the mock, in pixels.
// CSS variables cannot be used inside media queries, so these are TS only.
export const breakpoints = {
  xxs: 420, // command palette
  xs: 480, // login
  sm: 720, // all pages
  md: 860, // trade
  lg: 1100, // trade (min-width 1101px above it)
  xl: 1180, // host
} as const;
