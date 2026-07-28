"use client";

import { useEffect, useRef } from "react";

/**
 * The mark: a single QRS complex drawn with the same geometry the Pulse Trace
 * uses for one beat. The path animates in on mount — the logo is a sample of
 * the product's own data, not an unrelated icon.
 *
 * The animation uses stroke-dasharray/dashoffset so it works without JS
 * dependency on framer-motion, which keeps the logo fast-path on SSR too.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = String(len);
    el.style.strokeDashoffset = String(len);
    // Force reflow so the initial state is painted before the transition.
    void el.getBoundingClientRect();
    el.style.transition = "stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.strokeDashoffset = "0";
  }, []);

  return (
    <span
      className={`group flex items-center gap-2.5 ${className}`}
    >
      {/* Subtle pine glow behind the mark on hover */}
      <span className="relative flex items-center">
        <span
          className="absolute inset-0 -m-1 rounded-md bg-pine/0 blur-sm transition-all duration-500 group-hover:bg-pine/10"
          aria-hidden
        />
        <svg
          viewBox="0 0 34 20"
          className="relative h-[18px] w-[34px] shrink-0"
          aria-hidden
          focusable="false"
        >
          <path
            ref={pathRef}
            d="M0 14 L7 14 L9.5 11 L12 17 L15 3 L18 16 L20.5 14 L26 14 L28 10.5 L30 14 L34 14"
            fill="none"
            stroke="#124E4A"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="font-display text-[1.4rem] leading-none tracking-tight text-ink">
        Pulseline
      </span>
    </span>
  );
}
