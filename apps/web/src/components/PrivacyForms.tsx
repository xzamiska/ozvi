"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { deleteWholeProject, eraseMyData, type PrivacyState } from "@/lib/privacy-actions";
import { Result } from "./settings";

export function EraseMeForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<PrivacyState, FormData>((p, f) => eraseMyData(slug, p, f), {});
  const tf = useTranslations("forms");
  const t = useTranslations("forms.privacy");
  return (
    <Dialog>
      <DialogTrigger asChild><Button type="button" variant="destructive" className="justify-self-start"><Trash2 />{t("eraseOpen")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("eraseTitle")}</DialogTitle>
          <DialogDescription>{t("eraseText")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="confirm" value="on" />
          <Result error={state.error} />
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{tf("keep")}</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending || undefined}>{pending ? t("deleting") : t("erase")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<PrivacyState, FormData>((p, f) => deleteWholeProject(slug, p, f), {});
  const [typed, setTyped] = useState("");
  const tf = useTranslations("forms");
  const t = useTranslations("forms.privacy");
  return (
    <Dialog onOpenChange={(o) => { if (!o) setTyped(""); }}>
      <DialogTrigger asChild><Button type="button" variant="destructive" className="justify-self-start"><Trash2 />{t("deleteOpen")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { slug })}</DialogTitle>
          <DialogDescription>{t("deleteText")}</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="del-confirm" className="text-[14px]">{t("typeToConfirm")} <code className="font-mono font-semibold">{slug}</code></Label>
            <Input id="del-confirm" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-1p-ignore spellCheck={false} />
          </div>
          <Result error={state.error} />
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{tf("keep")}</Button></DialogClose>
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== slug} aria-busy={pending || undefined}>
              {pending ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
