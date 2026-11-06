"use client";
import { useEffect, useRef, useState } from "react";

// Size of an element, kept current with a ResizeObserver, for SVG charts that
// draw text at its real size instead of scaling a viewBox. CSS sets the size.
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
