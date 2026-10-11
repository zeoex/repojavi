export function Logo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#5a34f0" />
        <path d="M9 22V10h10M9 16h7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="23" cy="21" r="3" fill="#ff6b2c" />
      </svg>
      <span className="text-lg font-extrabold tracking-tight text-gray-900">
        Fed<span className="text-brand-600">express</span>
      </span>
    </span>
  );
}
