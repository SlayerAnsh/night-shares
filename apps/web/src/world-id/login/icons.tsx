// Small line icons for the sign in fine print (mock login.js).
const line = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
} as const;

export function LockIcon() {
  return (
    <svg aria-hidden="true" {...line}>
      <rect x="4" y="9" width="12" height="8.5" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

export function WalletIcon() {
  return (
    <svg aria-hidden="true" {...line}>
      <rect x="3" y="5" width="14" height="11" rx="2.5" />
      <path d="M13 10.5h4" />
    </svg>
  );
}

export function FaceIcon() {
  return (
    <svg aria-hidden="true" {...line} strokeLinecap="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M13 3h2a2 2 0 0 1 2 2v2M17 13v2a2 2 0 0 1-2 2h-2M7 17H5a2 2 0 0 1-2-2v-2" />
      <path d="M7.5 12.5c.7.7 1.5 1 2.5 1s1.8-.3 2.5-1M8 8v1M12 8v1" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  );
}
