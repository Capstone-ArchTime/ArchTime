import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const fontFamilyMono = '"JetBrains Mono", monospace';

export function Logo({
  to = "/",
  tagline,
  className,
}: {
  to?: string;
  tagline?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn("flex items-center gap-3 text-base font-bold tracking-wider text-white", className)}
      style={{ fontFamily: fontFamilyMono }}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00f0ff] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00f0ff]" />
      </span>
      <span>
        ARCHTIME
        {tagline && (
          <p className="mt-0.5 text-[10px] font-normal uppercase tracking-widest text-slate-500">{tagline}</p>
        )}
      </span>
    </Link>
  );
}
