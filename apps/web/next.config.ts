import type { NextConfig } from "next";

// The dev server writes to its own folder so that `next build` (run by
// checks or CI) never overwrites the chunks a running dev server needs.
const config: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default config;
