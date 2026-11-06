// r-sm, r and r-lg are mock variables. The rest are hard-coded radii the mock
// repeats often, keyed by pixel value.
export const radius = {
  "r-sm": "10px",
  r: "16px",
  "r-lg": "22px",
  "r-3": "3px", // kbd hints in the command palette, trade --r
  "r-4": "4px", // app switcher tabs, palette options, bars
  "r-6": "6px", // badges, app switcher, command palette
  "r-8": "8px",
  "r-12": "12px", // buttons, inputs, segmented control
  "r-14": "14px", // large button
  "r-24": "24px", // modal
  "r-pill": "999px",
} as const;
