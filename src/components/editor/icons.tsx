interface IconProps {
  className?: string
}

/** Crop marks — used for aspect-ratio / crop tools. */
export function IconCrop({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  )
}

/** 2x2 grid — used for layout / template tools. */
export function IconGrid({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

/** Square-in-square — used for border-thickness tools. */
export function IconFrame({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <rect x="8.25" y="8.25" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

/** Paint drop — used for workspace-background-color tools. */
export function IconDrop({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12Z" />
    </svg>
  )
}

/** Two overlapping circles — used for border-color tools. */
export function IconSwatch({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="9" cy="12" r="7" />
      <circle cx="15" cy="12" r="7" />
    </svg>
  )
}

/** Circular refresh arrows — used for the "force update" button. */
export function IconRefresh({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.6" />
      <path d="M4 4v4.6h4.6" />
      <path d="M4 13a8 8 0 0 0 13.7 4.7l2.3-2.3" />
      <path d="M20 20v-4.6h-4.6" />
    </svg>
  )
}

/** Rounded square with scattered dots — used for the film-grain tool. */
export function IconGrain({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="7.5" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="17" cy="9" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Instagram glyph (rounded square + lens + flash dot) — used for the follow-us link. */
export function IconInstagram({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Chevron — points right by default; flip with a `rotate-180` class for left. */
export function IconChevron({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}
