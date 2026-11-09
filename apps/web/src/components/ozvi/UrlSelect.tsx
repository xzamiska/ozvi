"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * A filter that lives in the URL, as a compact select (for lists too long for Segments).
 * Changing it keeps every other parameter and resets paging. `""` is the "all" option.
 */
export function UrlSelect({ name, value, label, options, className, resetKeys = ["p"] }: {
  name: string; value: string; label: string; options: { value: string; label: string }[]; className?: string;
  /** Paging parameters to drop on change (pages that page several lists at once, like the roadmap lanes). */
  resetKeys?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const ALL = "__all";
  return (
    <Select value={value || ALL} onValueChange={(v) => {
      const sp = new URLSearchParams(params.toString());
      if (v === ALL) sp.delete(name); else sp.set(name, v);
      for (const k of resetKeys) sp.delete(k);
      start(() => router.push(`${pathname}?${sp}`, { scroll: false }));
    }}>
      <SelectTrigger aria-label={label} data-pending={pending || undefined}
        className={cn("max-w-[220px] bg-surface text-[13.5px] font-medium data-pending:opacity-70", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value || ALL} value={o.value || ALL}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
