/**
 * Sector Pulse logo — three rising bars with a curved trend line.
 * Represents sector rotation (bars) + pulse/momentum (trend curve).
 * Not a heartbeat/EKG — deliberately unique.
 */
export function LogoIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <div className={`${className} rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center`}>
      <svg viewBox="0 0 32 32" className="w-[62%] h-[62%]" fill="none">
        {/* Three ascending bars */}
        <rect x="5" y="19" width="5" height="9" rx="1.2" fill="rgba(255,255,255,0.45)" />
        <rect x="13.5" y="13" width="5" height="15" rx="1.2" fill="rgba(255,255,255,0.65)" />
        <rect x="22" y="6" width="5" height="22" rx="1.2" fill="white" />
        {/* Trend curve connecting bar tops */}
        <path
          d="M7.5 18.5 Q11 12 16 12.5 Q21 13 24.5 5.5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Arrow tip at the end of curve */}
        <path
          d="M23 4.5 L24.8 5.3 L23.2 7"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
