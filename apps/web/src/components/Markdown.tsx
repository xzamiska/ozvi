import { renderMarkdown, type MarkdownOptions } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * User text (Markdown subset) as safe HTML. The HTML comes only from lib/markdown.ts, which escapes
 * every text and attribute and emits a fixed set of tags, so injecting it is safe by construction.
 */
export function Markdown({ source, className, ...opts }: { source: string; className?: string } & MarkdownOptions) {
  return <div className={cn("oz-prose oz-md", className)} dangerouslySetInnerHTML={{ __html: renderMarkdown(source, opts) }} />;
}
