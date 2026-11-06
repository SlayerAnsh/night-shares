"use client";
import { useRouter } from "next/navigation";
import { type AccessLevel, canAccess, loginHref } from "./access";
import { useSession } from "./SessionProvider";
export function useRequireAccess() {
  const router = useRouter();
  const { level } = useSession();
  return {
    require(
      why = "continue",
      need: AccessLevel = why === "book" ? "device" : "orb",
    ) {
      if (canAccess(level, need)) return true;
      router.push(
        loginHref(window.location.pathname + window.location.search, why, need),
      );
      return false;
    },
  };
}
