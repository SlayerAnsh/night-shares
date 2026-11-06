import type { ReactNode } from "react";

// Line icons from the approved mock (mock/v2/assets/shared.js, NS.ICON).
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const paths: Record<IconName, { box: number; body: ReactNode }> = {
  left: {
    box: 16,
    body: <path {...stroke} strokeWidth={1.8} d="M10 3 5 8l5 5" />,
  },
  right: {
    box: 16,
    body: <path {...stroke} strokeWidth={1.8} d="m6 3 5 5-5 5" />,
  },
  close: {
    box: 16,
    body: <path {...stroke} strokeWidth={1.8} d="M4 4l8 8M12 4l-8 8" />,
  },
  pin: {
    box: 20,
    body: (
      <g {...stroke} strokeWidth={1.6}>
        <path d="M10 18s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
        <circle cx="10" cy="8" r="2.2" />
      </g>
    ),
  },
  cal: {
    box: 20,
    body: (
      <g {...stroke} strokeWidth={1.6}>
        <rect x="3" y="4.5" width="14" height="12.5" rx="2.5" />
        <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
      </g>
    ),
  },
  user: {
    box: 20,
    body: (
      <g {...stroke} strokeWidth={1.6}>
        <circle cx="8" cy="7" r="3" />
        <path d="M2.5 16.5c.7-2.8 2.9-4.5 5.5-4.5s4.8 1.7 5.5 4.5" />
        <path d="M13 4.2a3 3 0 0 1 0 5.6M15.5 12.4c1 .8 1.7 2.2 2 4.1" />
      </g>
    ),
  },
  star: {
    box: 16,
    body: (
      <path
        fill="currentColor"
        d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2l-3.9 2.2.9-4.4-3.3-3 4.4-.5z"
      />
    ),
  },
  heart: {
    box: 20,
    body: (
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        d="M10 16.5s-6.5-3.8-6.5-8.6A3.4 3.4 0 0 1 10 6a3.4 3.4 0 0 1 6.5 1.9c0 4.8-6.5 8.6-6.5 8.6Z"
      />
    ),
  },
  check: {
    box: 20,
    body: <path {...stroke} strokeWidth={2} d="m4.5 10.5 3.5 3.5 7.5-8" />,
  },
};

export type IconName =
  | "left"
  | "right"
  | "close"
  | "pin"
  | "cal"
  | "user"
  | "star"
  | "heart"
  | "check";

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  const icon = paths[name];
  return (
    <svg
      viewBox={`0 0 ${icon.box} ${icon.box}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {icon.body}
    </svg>
  );
}
