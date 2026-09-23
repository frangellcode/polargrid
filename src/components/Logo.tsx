interface LogoProps {
  size?: number
  className?: string
  rounded?: boolean
}

/**
 * PolarGrid mark: an instant camera ejecting a 2×2 grid print, on a
 * petrol-blue badge. Drawn for this app — no stock artwork.
 * Keep this in sync with scripts/generate-icons.mjs (used to rasterize app icons).
 */
export function Logo({ size = 96, className, rounded = true }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="PolarGrid"
    >
      <rect x={0} y={0} width={200} height={200} rx={rounded ? 46 : 0} fill="#141e30" />
      <rect x="58" y="41" width="42" height="14" rx="4" fill="#4E5058" />
      <rect x="34" y="50" width="132" height="66" rx="12" fill="#D8D9DC" />
      <path d="M46 50h-0a12 12 0 0 0-12 12v54h10V62a12 12 0 0 1 12-12z" fill="#C4C5C9" />
      <rect x="34" y="98" width="132" height="4" fill="#FFE88A" />
      <rect x="34" y="102" width="132" height="4" fill="#FD5E95" />
      <rect x="34" y="106" width="132" height="4" fill="#45CAE0" />
      <circle cx="100" cy="75" r="22" fill="#909296" />
      <circle cx="100" cy="75" r="17" fill="#64666D" />
      <circle cx="100" cy="75" r="10.5" fill="#3F4149" />
      <circle cx="105.5" cy="69.5" r="4" fill="#BDBDC0" />
      <circle cx="56" cy="66" r="7.5" fill="#D14D7B" />
      <circle cx="56" cy="66" r="4.8" fill="#FD5E95" />
      <rect x="48" y="80" width="18" height="3.5" rx="1.75" fill="#9A9CA2" />
      <rect x="48" y="87" width="18" height="3.5" rx="1.75" fill="#9A9CA2" />
      <rect x="133" y="59" width="22" height="17" rx="3.5" fill="#7A7C82" />
      <rect x="136.5" y="62.5" width="15" height="10" rx="1.5" fill="#E9E9EA" />
      <path d="M141 72.5l7-10h3.5l-7 10z" fill="#BDBDC0" />
      <rect x="30" y="110" width="140" height="34" rx="10" fill="#4E5058" />
      <path d="M30 134v0a10 10 0 0 0 10 10h120a10 10 0 0 0 10-10v0z" fill="#383A43" />
      <rect x="60" y="123" width="80" height="7" rx="3.5" fill="#2A2C33" />
      <rect x="67" y="127" width="66" height="42" rx="3" fill="#F2F2F3" />
      <rect x="67" y="127" width="66" height="4" fill="#D8D9DC" />
      <rect x="73" y="133" width="26" height="13" rx="1.5" fill="#45CAE0" />
      <rect x="101" y="133" width="26" height="13" rx="1.5" fill="#FFE88A" />
      <rect x="73" y="148" width="26" height="13" rx="1.5" fill="#FD5E95" />
      <rect x="101" y="148" width="26" height="13" rx="1.5" fill="#8FD9B6" />
    </svg>
  )
}
