"use client";

import { ExternalLink, GitPullRequest, X } from "lucide-react";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { addProof, deleteProof, type ProofState } from "@/lib/proof-actions";

/**
 * Team: proof of the fix. Merged PRs arrive from GitHub on their own (a PR body line "Ozvi: #12" or
 * "Fixes #40" of a linked issue); a preview/demo URL can be added here. Both go with the "fixed" stop
 * into the reporter's e-mail and onto the timeline.
 */
export function ProofBox({ slug, itemId, kind, proofs }: {
  slug: string; itemId: string; kind: "bug" | "idea";
  proofs: { id: string; kind: "pr" | "preview"; url: string; title: string | null; ref: string | null }[];
}) {
  const t = useTranslations("forms.proof");
  const [state, action, pending] = useActionState((p: ProofState, f: FormData) => addProof(slug, itemId, p, f), {});
  const [removing, start] = useTransition();
  return (
    <div className="grid gap-3">
      <p className="text-[13px] leading-snug text-muted-foreground">{kind === "bug" ? t("hintBug") : t("hintIdea")}</p>
      {proofs.length > 0 && (
        <ul className="grid gap-1.5">
          {proofs.map((p) => (
            <li key={p.id} className="flex min-w-0 items-center gap-2 text-[13.5px]">
              {p.kind === "pr" ? <GitPullRequest aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /> : <ExternalLink aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
              <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">
                {p.kind === "preview" ? (p.title || t("preview")) : (p.title || p.ref || p.url)}
              </a>
              {p.ref && <span className="shrink-0 text-[12.5px] text-muted-foreground" data-num>{p.ref}</span>}
              <Button variant="ghost" size="icon-xs" aria-label={t("remove", { what: p.ref ?? p.url })} disabled={removing}
                onClick={() => start(async () => { await deleteProof(slug, itemId, p.id); toast(t("removed")); })}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form key={proofs.length} action={action} className="grid gap-2">
        <Input name="url" type="url" required inputMode="url" aria-label={t("urlLabel")} placeholder={t("urlPlaceholder")} autoComplete="off" data-1p-ignore />
        <Button variant="outline" size="sm" disabled={pending} aria-busy={pending || undefined}>{t("add")}</Button>
        {state.error && <p className="text-[13px] font-medium text-destructive" role="alert">{state.error}</p>}
        {state.ok && <p className="text-[13px] font-medium text-success" role="status">{state.ok}</p>}
      </form>
    </div>
  );
}
