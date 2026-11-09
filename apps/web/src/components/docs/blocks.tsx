import { cn } from "@/lib/utils";
import { CopyButton } from "../settings";

/** Building blocks of the developer docs: code samples, tables, callouts, HTTP method tags. */

export function Code({ code, title, className }: { code: string; title?: string; className?: string }) {
  const text = code.replace(/^\n+|\s+$/g, "");
  return (
    <figure className={cn("my-5 min-w-0 overflow-hidden rounded-xl border bg-surface", className)}>
      <figcaption className="flex min-h-11 items-center justify-between gap-3 border-b bg-wash py-1.5 pr-1.5 pl-4">
        <span className="truncate font-mono text-[12.5px] text-muted-foreground">{title ?? " "}</span>
        <CopyButton text={text} className="h-8" />
      </figcaption>
      {/* Scrolls inside the block (the page never scrolls sideways); focusable so keyboard users can scroll it. */}
      <pre tabIndex={0} className="overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-[1.65] whitespace-pre focus-visible:outline-offset-[-2px]"><code>{text}</code></pre>
    </figure>
  );
}

/** On phones rows stack (no sideways scrolling); explicit roles keep the table semantics when display changes. */
export function Table({ label, head, rows, className }: { label: string; head: React.ReactNode[]; rows: React.ReactNode[][]; className?: string }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className={cn("my-5 overflow-x-auto rounded-xl border bg-surface focus-visible:outline-offset-[-2px]", className)}>
      <table role="table" className="w-full border-collapse text-left text-[14px] leading-snug max-sm:block">
        <thead role="rowgroup" className="bg-wash max-sm:sr-only">
          <tr role="row">{head.map((h, i) => <th key={i} role="columnheader" scope="col" className="border-b px-3.5 py-2.5 text-[13px] font-semibold whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody role="rowgroup" className="divide-y align-top max-sm:block">
          {rows.map((r, i) => (
            <tr key={i} role="row" className="max-sm:grid max-sm:gap-1 max-sm:px-3.5 max-sm:py-3">
              {r.map((c, j) => <td key={j} role="cell" className={cn("px-3.5 py-2.5 max-sm:p-0", j === 0 && "whitespace-nowrap max-sm:font-semibold")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Note({ title, children, tone = "info" }: { title?: string; children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div role="note" className={cn("my-5 rounded-xl border px-4 py-3.5 text-[14.5px]", tone === "warn" ? "border-dashed border-st-ack/60 bg-st-ack/5" : "bg-wash")}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && "mt-1", "[&_p+p]:mt-2")}>{children}</div>
    </div>
  );
}

const METHOD_TONE: Record<string, string> = {
  GET: "border-line-strong text-foreground",
  POST: "border-brand-line bg-brand-soft text-brand-text",
  PATCH: "border-st-ack/50 text-foreground",
  DELETE: "border-destructive/50 text-destructive",
};

/** HTTP method as a word in a fixed-width tag (never colour alone: the word is the label). */
export function Method({ m }: { m: string }) {
  return <span className={cn("inline-flex h-6 min-w-[3.75rem] items-center justify-center rounded-md border px-1.5 font-mono text-[11.5px] font-semibold", METHOD_TONE[m])}>{m}</span>;
}
