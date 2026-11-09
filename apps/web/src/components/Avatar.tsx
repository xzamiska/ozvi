import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Initials avatar; hue derived from the name so people stay recognisable across a thread. */
export function Avatar({ name, url, size = 28, className }: { name: string | null; url?: string | null; size?: number; className?: string }) {
  const base = cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold leading-none select-none", className);
  if (url) return <img className={cn(base, "object-cover")} src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  let h = 0;
  for (const c of name ?? "?") h = (h * 31 + c.charCodeAt(0)) % 360;
  // Under 28px two letters get too small to read: one initial, a bit larger.
  const small = size < 28;
  return (
    <span className={base} aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * (small ? 0.46 : 0.38)), background: `oklch(0.92 0.045 ${h})`, color: `oklch(0.36 0.09 ${h})` }}>
      {small ? initials(name).slice(0, 1) : initials(name)}
    </span>
  );
}
