// Stacking layers used by the mock.
export const zIndex = {
  raised: "1", // crumbs, calendar day labels
  sticky: "5", // trade market table header
  nav: "50",
  popover: "60", // account menu, mobile host panel
  modal: "100", // also the command palette backdrop
  toast: "200",
} as const;
