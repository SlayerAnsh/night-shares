// Gap and padding steps the mock uses most, keyed by pixel value (--sp-8).
// The mock has no space variables. Singletons (1px, 3px, 5px) are left out.
export const space = {
  "2": "2px",
  "4": "4px",
  "6": "6px",
  "8": "8px",
  "10": "10px",
  "12": "12px",
  "14": "14px",
  "16": "16px",
  "18": "18px",
  "20": "20px",
  "24": "24px",
  "28": "28px",
  "32": "32px",
} as const;

// Page layout. nav-h is a mock variable. The others come from .wrap and .wrap-wide.
export const layout = {
  "nav-h": "68px",
  "wrap-max": "1240px",
  "wrap-wide-max": "1480px",
  gutter: "24px",
} as const;
