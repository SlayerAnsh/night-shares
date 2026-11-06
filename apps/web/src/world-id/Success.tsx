"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export function Success({ next }: { next: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 1000);
    return () => clearTimeout(timer);
  }, [next, router]);
  return (
    <p role="status">
      World ID verified. USDC wallet on Arc ready. Returning to your page.
    </p>
  );
}
