"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { saveVoting, type AdminState } from "@/lib/admin-actions";
import { ChoiceLabel, Field, hint, noFill, panel, Result } from "./settings";

/** Admin: how people vote (simple upvote or importance 1–3) and an optional vote budget per person. */
export function VotingForm({ slug, mode, budget }: { slug: string; mode: "simple" | "importance"; budget: number | null }) {
  const t = useTranslations("admin.settings.voting");
  const s = useTranslations("admin.settings");
  const [state, action, pending] = useActionState((p: AdminState, f: FormData) => saveVoting(slug, p, f), {});
  const [limited, setLimited] = useState(budget !== null);
  return (
    <form action={action} className={panel}>
      <fieldset className="grid gap-2.5">
        <legend className="mb-2.5 text-[14px] font-semibold">{t("mode")}</legend>
        <RadioGroup name="voteMode" defaultValue={mode} className="gap-2.5">
          {(["simple", "importance"] as const).map((m) => (
            <div key={m} className="grid grid-cols-[16px_1fr] items-start gap-2.5">
              <RadioGroupItem id={`vote-${m}`} value={m} className="mt-0.5" />
              <ChoiceLabel htmlFor={`vote-${m}`} title={t(`${m}Title`)} text={t(`${m}Text`)} />
            </div>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-0.5">
            <Label htmlFor="vote-limited" className="text-[14px] font-semibold">{t("budgetTitle")}</Label>
            <p className={hint} id="vote-limited-hint">{t("budgetText")}</p>
          </div>
          <Switch id="vote-limited" name="limited" checked={limited} onCheckedChange={setLimited} aria-describedby="vote-limited-hint" className="mt-0.5" />
        </div>
        {limited && (
          <Field id="vote-budget" label={t("budget")} hint={t("budgetHint")}>
            <Input id="vote-budget" name="voteBudget" type="number" inputMode="numeric" min={1} max={100} required
              defaultValue={budget ?? 10} {...noFill} className="w-28 tabular-nums" />
          </Field>
        )}
      </div>
      <div className="grid gap-3">
        <Result error={state.error} ok={state.ok} />
        <div><Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? s("saving") : t("save")}</Button></div>
      </div>
    </form>
  );
}
