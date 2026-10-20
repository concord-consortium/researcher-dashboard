import { useEffect, type RefObject } from "react";

// Publishes an element's height as a custom property on the page's root, for what sticks below it or
// scrolls clear of it, and removes it when the element goes.
export function usePublishedHeight(ref: RefObject<HTMLElement>, property: string): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() => root.setProperty(property, `${element.offsetHeight}px`));
    observer.observe(element);
    return () => { observer.disconnect(); root.removeProperty(property); };
  }, [ref, property]);
}
