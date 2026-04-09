/**
 * Sector Pulse logo — a single clean rising bar chart silhouette.
 * Minimal: just 3 bars ascending left-to-right inside a rounded square.
 */
export function LogoIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <div className={`${className} rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center`}>
      <svg viewBox="0 0 24 24" className="w-[58%] h-[58%]" fill="none">
        <rect x="3"  y="14" width="4" height="7" rx="1" fill="rgba(255,255,255,0.5)" />
        <rect x="10" y="9"  width="4" height="12" rx="1" fill="rgba(255,255,255,0.75)" />
        <rect x="17" y="3"  width="4" height="18" rx="1" fill="white" />
      </svg>
    </div>
  )
}
