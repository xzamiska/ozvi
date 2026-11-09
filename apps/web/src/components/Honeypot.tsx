import { HONEYPOT } from "@/lib/moderation-rules";

/**
 * A field people never see or reach (off-screen, out of the tab order, hidden from screen readers)
 * but form-filling bots do. The server drops submissions that fill it.
 */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden opacity-0">
      <label>Website<input type="text" name={HONEYPOT} tabIndex={-1} autoComplete="off" defaultValue="" /></label>
    </div>
  );
}
