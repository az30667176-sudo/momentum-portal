/**
 * Sector Pulse logo — an S-curve (representing sector rotation / momentum shift)
 * with a dot at the peak, inside a rounded gradient square.
 */
export function LogoIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <div className={`${className} rounded-lg bg-gradient-to-br from-slate-700 to-emerald-600 flex items-center justify-center`}>
      <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="none">
        <path
          d="M6 20 C6 14 18 16 18 12 C18 8 6 10 6 4"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="6" cy="4" r="2" fill="white" />
      </svg>
    </div>
  )
}
