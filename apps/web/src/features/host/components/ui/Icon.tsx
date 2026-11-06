const PATHS = {
  left: "M15 18l-6-6 6-6",
  right: "M9 18l6-6-6-6",
  close: "M18 6L6 18M6 6l12 12",
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
