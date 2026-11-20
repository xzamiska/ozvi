"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/ozvi/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const KEYS = ["newBug", "newIdea", "comments", "assigned", "digest"] as const;
const PACES = ["instant", "hourly", "daily"] as const;
type Pace = (typeof PACES)[number];
type Prefs = Partial<Record<(typeof KEYS)[number], boolean>> & { pace?: Pace };

/** Team e-mails a team member wants; a missing key is on (lib/email/notify.ts teamIds). */
export function TeamMailForm({ action, prefs, off }: { action: (form: FormData) => Promise<void>; prefs: Prefs; off: boolean }) {
  const t = useTranslations("board.me");
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(KEYS.map((k) => [k, prefs[k] !== false])));
  const [pace, setPace] = useState<Pace>(prefs.pace ?? "instant");
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const f = new FormData();
    for (const k of KEYS) if (on[k]) f.set(k, "on");
    f.set("pace", pace);
    await action(f);
    toast.success(t("teamMailSaved"));
  });
  return (
    <Panel className="grid gap-4 p-5 sm:p-6">
      {off && <p className="text-[13.5px] text-muted-foreground">{t("teamMailAllOff")}</p>}
      <div className="grid gap-3">
        {KEYS.map((k) => (
          <label key={k} className="flex items-start gap-3 text-[14.5px]">
            <Checkbox checked={on[k]} onCheckedChange={(v) => setOn((o) => ({ ...o, [k]: v === true }))} className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="font-medium">{t(`teamMailItems.${k}.title`)}</span>
              <span className="text-[13px] text-muted-foreground">{t(`teamMailItems.${k}.text`)}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="grid gap-3 border-t border-border pt-4">
        <p id="team-mail-pace" className="text-[14.5px] font-medium">{t("teamMailPace")}</p>
        <RadioGroup aria-labelledby="team-mail-pace" value={pace} onValueChange={(v) => setPace(v as Pace)} className="gap-3">
          {PACES.map((p) => (
            <label key={p} htmlFor={`pace-${p}`} className="flex items-start gap-3 text-[14.5px]">
              <RadioGroupItem id={`pace-${p}`} value={p} className="mt-1" />
              <span className="grid gap-0.5">
                <span>{t(`teamMailPaces.${p}.title`)}</span>
                <span className="text-[13px] text-muted-foreground">{t(`teamMailPaces.${p}.text`)}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>
      <div><Button type="button" variant="outline" onClick={save} disabled={pending} aria-busy={pending || undefined}>{t("teamMailSave")}</Button></div>
    </Panel>
  );
}
