import { useId } from "react";

// The Night Shares mark from the mock (NS.LOGO). Trade recolors it through CSS.
export function Logo({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 34 34" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#2A14C4" />
          <stop offset=".55" stopColor="#5422C9" />
          <stop offset="1" stopColor="#A63BB8" />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect width="34" height="34" fill="#fff" />
          <circle cx="20.5" cy="13" r="7.4" fill="#000" />
        </mask>
      </defs>
      <rect width="34" height="34" rx="10" fill={`url(#${id}g)`} />
      <circle cx="16" cy="17" r="8.6" fill="#fff" mask={`url(#${id}m)`} />
      <circle cx="24.6" cy="22.6" r="1.3" fill="#fff" />
    </svg>
  );
}
