interface LogoProps {
  size?: number
  className?: string
  rounded?: boolean
}

let uid = 0

/**
 * PolarGrid mark: a small, fully-rounded teddy-style polar bear cub (round
 * ears, head, body and feet), holding its camera with both paws, amid soft
 * snowflakes, on a sky-blue badge.
 * Keep this in sync with scripts/generate-icons.mjs (used to rasterize app icons).
 */
export function Logo({ size = 96, className, rounded = true }: LogoProps) {
  const id = `pg${uid++}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="PolarGrid"
    >
      <defs>
        <radialGradient id={`${id}-fur`} cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#f9fcff" />
          <stop offset="100%" stopColor="#c3d6e4" />
        </radialGradient>
        <radialGradient id={`${id}-eye`} cx="36%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#4a3a2a" />
          <stop offset="45%" stopColor="#221a12" />
          <stop offset="100%" stopColor="#0a0806" />
        </radialGradient>
        <linearGradient id={`${id}-badge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={`${id}-cam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id={`${id}-blur-sm`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <rect x={0} y={0} width={200} height={200} rx={rounded ? 46 : 0} fill={`url(#${id}-badge)`} />

      {/* snowflakes */}
      <g opacity={0.75} filter={`url(#${id}-blur-sm)`} stroke="#fff" strokeWidth={2} strokeLinecap="round">
        <path d="M40,44 L40,54 M35,49 L45,49 M36.5,45.5 L43.5,52.5 M43.5,45.5 L36.5,52.5" />
        <path d="M164,40 L164,50 M159,45 L169,45" strokeWidth={1.8} />
        <path d="M156,130 L156,138 M152,134 L160,134" strokeWidth={1.6} />
      </g>

      <ellipse cx={100} cy={180} rx={46} ry={7} fill="#075985" opacity={0.22} filter={`url(#${id}-blur)`} />

      {/* feet */}
      <circle cx={80} cy={167} r={13} fill={`url(#${id}-fur)`} />
      <circle cx={120} cy={167} r={13} fill={`url(#${id}-fur)`} />

      {/* body */}
      <circle cx={100} cy={140} r={34} fill={`url(#${id}-fur)`} />

      {/* ears */}
      <circle cx={74} cy={50} r={13} fill={`url(#${id}-fur)`} />
      <circle cx={126} cy={50} r={13} fill={`url(#${id}-fur)`} />
      <circle cx={74} cy={53} r={6.5} fill="#a9c6da" opacity={0.85} />
      <circle cx={126} cy={53} r={6.5} fill="#a9c6da" opacity={0.85} />

      {/* head */}
      <circle cx={100} cy={82} r={36} fill={`url(#${id}-fur)`} />

      {/* eyes */}
      <circle cx={86} cy={78} r={7} fill={`url(#${id}-eye)`} />
      <circle cx={114} cy={78} r={7} fill={`url(#${id}-eye)`} />
      <circle cx={88} cy={75.5} r={2} fill="#fff" opacity={0.9} />
      <circle cx={116} cy={75.5} r={2} fill="#fff" opacity={0.9} />

      {/* nose + mouth */}
      <ellipse cx={100} cy={91} rx={5} ry={3.6} fill="#1c1712" />
      <path d="M92,99 Q100,104 108,99" stroke="#1c1712" strokeWidth={2} strokeLinecap="round" fill="none" />

      {/* camera, held between both paws */}
      <rect x={82} y={122} width={36} height={26} rx={9} fill={`url(#${id}-cam)`} stroke="#fff" strokeWidth={2.5} />
      <circle cx={100} cy={135} r={8} fill="#fff" />
      <circle cx={100} cy={135} r={4.6} fill="#075985" />

      {/* paws gripping the camera's sides */}
      <circle cx={72} cy={137} r={14} fill={`url(#${id}-fur)`} />
      <circle cx={128} cy={137} r={14} fill={`url(#${id}-fur)`} />
    </svg>
  )
}
