/**
 * The mark: a single QRS complex, drawn with the same geometry the Pulse Trace
 * uses for one beat. The logo is a sample of the product's own data view rather
 * than an unrelated icon.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 34 20"
        className="h-4 w-[34px] shrink-0"
        aria-hidden
        focusable="false"
      >
        <path
          d="M0 14 L7 14 L9.5 11 L12 17 L15 3 L18 16 L20.5 14 L26 14 L28 10.5 L30 14 L34 14"
          fill="none"
          stroke="#124E4A"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-display text-[1.375rem] leading-none tracking-tight text-ink">
        Pulseline
      </span>
    </span>
  );
}
