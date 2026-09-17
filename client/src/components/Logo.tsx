/** Panda mark — same geometry as the PWA icons (scripts/make-icons.py). */
export function PandaMark({ size = 40, className = "", ink = "#232323", face = "#FFFDF8" }: { size?: number; className?: string; ink?: string; face?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="24" cy="27" r="13" fill={ink} />
      <circle cx="76" cy="27" r="13" fill={ink} />
      <circle cx="50" cy="54" r="34" fill={ink} />
      <circle cx="50" cy="54" r="32.2" fill={face} />
      <ellipse cx="38" cy="50" rx="8.5" ry="12" transform="rotate(-22 38 50)" fill={ink} />
      <ellipse cx="62" cy="50" rx="8.5" ry="12" transform="rotate(22 62 50)" fill={ink} />
      <circle cx="39.5" cy="49" r="3.6" fill={face} />
      <circle cx="60.5" cy="49" r="3.6" fill={face} />
      <circle cx="40.2" cy="49.4" r="2" fill={ink} />
      <circle cx="59.8" cy="49.4" r="2" fill={ink} />
      <circle cx="41" cy="48.5" r="0.7" fill={face} />
      <circle cx="60.6" cy="48.5" r="0.7" fill={face} />
      <ellipse cx="50" cy="63" rx="4.6" ry="3.2" fill={ink} />
      <path d="M50 66v3M43.5 68.5c1.5 3 5 4 6.5 1.5M56.5 68.5c-1.5 3-5 4-6.5 1.5" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <ellipse cx="29" cy="62" rx="4.5" ry="2.6" fill="#F5A3B5" opacity="0.7" />
      <ellipse cx="71" cy="62" rx="4.5" ry="2.6" fill="#F5A3B5" opacity="0.7" />
    </svg>
  );
}

/** Wordmark: GI🐼KA — the panda replaces the O, like the brand logo. */
export function Wordmark({ height = 32, color = "#232323", face = "#F4EFE8", className = "" }: { height?: number; color?: string; face?: string; className?: string }) {
  const fs = height * 1.05;
  return (
    <div className={`inline-flex items-center ${className}`} style={{ height, color }} aria-label="Gioka">
      <span className="font-black tracking-[-0.03em] leading-none" style={{ fontSize: fs }}>GI</span>
      <PandaMark size={height * 1.15} ink={color} face={face} className="-mx-[2px] -mt-[6%]" />
      <span className="font-black tracking-[-0.03em] leading-none" style={{ fontSize: fs }}>KA</span>
    </div>
  );
}

export function LogoLockup({ dark = false, size = 40 }: { dark?: boolean; size?: number }) {
  const ink = dark ? "#FFFDF8" : "#232323";
  return (
    <div className="flex items-center gap-3">
      <div className={`grid place-items-center rounded-2xl ${dark ? "bg-white/10" : "bg-cream"}`} style={{ width: size + 12, height: size + 12 }}>
        <PandaMark size={size} ink={dark ? "#232323" : "#232323"} />
      </div>
      <div className="leading-none">
        <div className="font-black tracking-tight" style={{ fontSize: size * 0.62, color: ink }}>Gioka</div>
        <div className="text-[11px] font-bold tracking-[0.18em] uppercase mt-1" style={{ color: dark ? "rgba(255,253,248,0.55)" : "#8a8580" }}>Café · Heladería · Bakery</div>
      </div>
    </div>
  );
}
