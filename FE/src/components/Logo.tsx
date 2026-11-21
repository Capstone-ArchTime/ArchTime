import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const fontFamilyMono = 'var(--at-font-mono)';

export function Logo({
  to = "/",
  tagline,
  className,
}: {
  to?: string;
  tagline?: string;
  className?: string;
}) {
  const location = useLocation();

  const handleClick = (e: React.MouseEvent) => {
    if (location.pathname === to) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <Link
      to={to}
      onClick={handleClick}
      className={cn("flex items-center gap-3 text-base font-bold tracking-wider text-[var(--at-text-strong)]", className)}
      style={{ fontFamily: fontFamilyMono }}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-[var(--at-glow)] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--at-glow)]" />
      </span>
      <span>
        ARCHTIME
        {tagline && (
          <p className="mt-0.5 text-[10px] font-normal uppercase tracking-widest text-[var(--at-muted)]">{tagline}</p>
        )}
      </span>
    </Link>
  );
}
