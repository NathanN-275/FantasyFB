"use client";

import { useEffect, useRef, type ReactNode } from "react";

const MOBILE_QUERY = "(max-width: 600px)";

export function ResponsiveFilterPanel({
  children,
  resultLabel
}: {
  children: ReactNode;
  resultLabel: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const synchronize = () => {
      if (details.current) details.current.open = !media.matches;
    };
    synchronize();
    media.addEventListener("change", synchronize);
    return () => media.removeEventListener("change", synchronize);
  }, []);

  return (
    <details className="filter-panel" open ref={details}>
      <summary className="filter-summary">
        <span>Filter and sort players</span>
        <span>{resultLabel}</span>
      </summary>
      <div className="filter-content">{children}</div>
    </details>
  );
}
