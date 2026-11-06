import { type IconName, iconPaths } from "./icon-paths";

export type IconProps = {
  name: IconName;
  // Width and height in px. Leave off to size the icon with CSS.
  size?: number;
  className?: string;
};

// One line icon, drawn in the current text color. Always decorative.
export function Icon({ name, size, className }: IconProps) {
  const icon = iconPaths[name];
  return (
    <svg
      viewBox={`0 0 ${icon.box} ${icon.box}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {icon.body}
    </svg>
  );
}
