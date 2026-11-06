"use client";
import { usePathname } from "next/navigation";
import { AppNav } from "../nav/AppNav";
import type { AppKey } from "../nav/apps";

// The app nav, transparent over the hero photo unless the path ends in one of
// solidOn (screens without a hero, such as checkout).
export function HeroNav({ app, solidOn }: { app: AppKey; solidOn: string[] }) {
  const path = usePathname();
  const solid = solidOn.some((end) => path.endsWith(end));
  return <AppNav app={app} hero={!solid} />;
}
