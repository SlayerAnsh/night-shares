// max-width media query breakpoints used by the mock, in pixels.
// CSS variables cannot be used inside media queries, so these are TS only.
export const breakpoints = {
  xs: 480, // login
  sm: 720, // all pages
  md: 820, // trade
  lg: 1080, // trade
  xl: 1180, // host
} as const;
