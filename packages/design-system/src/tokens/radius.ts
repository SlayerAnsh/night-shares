// r-sm, r and r-lg are mock variables. The rest are hard-coded radii the mock
// repeats often, keyed by pixel value.
export const radius = {
  "r-sm": "10px",
  r: "16px",
  "r-lg": "22px",
  "r-6": "6px", // badges
  "r-8": "8px",
  "r-12": "12px", // buttons, inputs, segmented control
  "r-14": "14px", // large button
  "r-24": "24px", // modal
  "r-pill": "999px",
} as const;
