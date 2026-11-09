/** Class strings shared by settings screens; plain module so server components can import it too. */

export const panel = "grid gap-5 rounded-xl border bg-surface p-5 sm:p-6";
export const hint = "text-[13px] leading-snug text-muted-foreground";
export const codeBox = "block font-mono text-[13px] bg-muted rounded-md px-3 py-2 break-all select-all";
export const preBox = "overflow-x-auto rounded-md bg-muted px-3 py-2.5 font-mono text-[12.5px] leading-relaxed whitespace-pre";
/** Plain text inputs that are not credentials: keep password managers away. */
export const noFill = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true" } as const;

/** One settings section: heading, one-line description, then panels. */
export function SettingsSection({ id, title, text, children }: { id: string; title: string; text?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid min-w-0 scroll-mt-24 gap-4">
      <div>
        <h2 id={`${id}-h`} className="font-heading text-[17px] font-bold tracking-tight">{title}</h2>
        {text && <p className="mt-1 max-w-[68ch] text-[14px] text-muted-foreground">{text}</p>}
      </div>
      {children}
    </section>
  );
}

/** A titled block inside a section (e.g. GitHub inside Integrácie). */
export function SettingsBlock({ id, title, text, children }: { id?: string; title: string; text?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div id={id} className="grid min-w-0 scroll-mt-24 gap-3">
      <div>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {text && <p className="mt-0.5 max-w-[68ch] text-[13.5px] text-muted-foreground">{text}</p>}
      </div>
      {children}
    </div>
  );
}
