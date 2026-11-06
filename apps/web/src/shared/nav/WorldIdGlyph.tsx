// The World ID mark used on sign in buttons (mock ID_GLYPH).
export function WorldIdGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 12h9.2" />
      <path d="M12.8 12a4.2 4.2 0 0 1 4.2-4.2" />
    </svg>
  );
}
