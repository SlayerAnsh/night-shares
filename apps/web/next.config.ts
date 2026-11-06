import type { NextConfig } from "next";

// The dev server writes to its own folder so that `next build` (run by
// checks or CI) never overwrites the chunks a running dev server needs.
const config: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // The design system ships TypeScript and CSS Modules source, so Next compiles it.
  transpilePackages: ["@night-shares/design-system"],
};

export default config;
