/** HiLCoE mark — blue disc, interlocked white "N" monogram, red diagonal
 * ribbon, worn as the brand's signature across the sidebar, auth pages,
 * and favicon. `monogramOnly` drops the disc for use on colored surfaces. */
export function Logo({ size = 32, className = "", monogramOnly = false }: {
  size?: number; className?: string; monogramOnly?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="HiLCoE"
    >
      <defs>
        <linearGradient id="hilcoe-disc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2a63d6" />
          <stop offset="100%" stopColor="#153f9e" />
        </linearGradient>
        <linearGradient id="hilcoe-ribbon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff5c5c" />
          <stop offset="100%" stopColor="#c81e2c" />
        </linearGradient>
        <clipPath id="hilcoe-disc-clip">
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>

      {!monogramOnly && <circle cx="50" cy="50" r="48" fill="url(#hilcoe-disc)" />}

      <g clipPath={monogramOnly ? undefined : "url(#hilcoe-disc-clip)"}>
        {/* orbiting swoosh, suggests motion/globe behind the monogram */}
        <path
          d="M 14 32 A 40 40 0 0 1 60 10 A 46 46 0 0 0 22 70"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* N monogram — two bold strokes */}
        <path d="M 30 76 L 30 24 L 42 24 L 42 76 Z" fill="#ffffff" />
        <path d="M 58 76 L 58 24 L 70 24 L 70 76 Z" fill="#ffffff" />
        <path d="M 30 26 L 42 26 L 70 74 L 58 74 Z" fill="#ffffff" />

        {/* red ribbon slicing across the diagonal */}
        <path d="M 26 58 L 74 58 L 62 46 L 38 46 Z" fill="url(#hilcoe-ribbon)" />
      </g>

      {!monogramOnly && <circle cx="82" cy="20" r="3.4" fill="#101a33" opacity="0.85" />}
    </svg>
  );
}
