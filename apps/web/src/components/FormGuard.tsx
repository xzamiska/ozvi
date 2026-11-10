"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Our own messages for HTML constraint validation, in every form of the app at once (mounted in the
 * root layout). Forms keep their native rules (required, type="email", pattern, minLength…), so
 * they still work without JavaScript; this replaces only the browser's bubble:
 *  - the `invalid` event is cancelled (no native bubble) and the message is written under the
 *    field in the reader's language, linked by aria-describedby, with aria-invalid on the field;
 *  - the first invalid field of a submit gets focus;
 *  - the message updates while typing and disappears once the field is valid.
 * A field can carry its own message for a pattern or a too-short value: `data-error="…"`.
 */
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isControl = (n: EventTarget | null): n is Control =>
  n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || n instanceof HTMLSelectElement;

export function FormGuard() {
  const t = useTranslations("forms.validation");

  useEffect(() => {
    const labelOf = (el: Control) => {
      const text = el.labels?.[0]?.childNodes[0]?.textContent ?? el.getAttribute("aria-label") ?? (el as HTMLInputElement).placeholder ?? "";
      return text.replace(/\s+/g, " ").trim() || t("thisField");
    };
    const message = (el: Control): string => {
      const v = el.validity;
      const own = el.dataset.error;
      const label = labelOf(el);
      if (v.valueMissing) {
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return own ?? t(el.type === "radio" ? "choose" : "check", { label });
        if (el instanceof HTMLSelectElement) return own ?? t("choose", { label });
        if (el instanceof HTMLInputElement && el.type === "file") return own ?? t("file", { label });
        return t("required", { label });
      }
      if (v.typeMismatch) return own ?? t(el.type === "email" ? "email" : el.type === "url" ? "url" : "format");
      if (v.patternMismatch) return own ?? t("format");
      if (v.tooShort) return own ?? t("tooShort", { n: (el as HTMLInputElement).minLength });
      if (v.tooLong) return t("tooLong", { n: (el as HTMLInputElement).maxLength });
      if (v.badInput) return t("number");
      if (v.rangeUnderflow) return t("min", { n: (el as HTMLInputElement).min });
      if (v.rangeOverflow) return t("max", { n: (el as HTMLInputElement).max });
      if (v.stepMismatch) return t("format");
      return el.validationMessage;
    };

    let seq = 0;
    const boxOf = (el: Control) => {
      if (!el.id) el.id = `oz-f${++seq}`;
      return document.getElementById(`${el.id}-error`);
    };
    const describe = (el: Control, id: string, on: boolean) => {
      const ids = new Set((el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
      if (on) ids.add(id); else ids.delete(id);
      if (ids.size) el.setAttribute("aria-describedby", [...ids].join(" ")); else el.removeAttribute("aria-describedby");
    };
    const show = (el: Control) => {
      let box = boxOf(el);
      if (!box) {
        box = document.createElement("p");
        box.id = `${el.id}-error`;
        box.className = "oz-field-error";
        // Under the control (or its wrapper, e.g. an input with an icon), above the hint.
        const anchor = el.closest("[data-field-control]") ?? (el.type === "radio" || el.type === "checkbox" ? el.closest("fieldset") ?? el : el);
        anchor.insertAdjacentElement(anchor.tagName === "FIELDSET" ? "beforeend" : "afterend", box);
      }
      box.textContent = message(el);
      el.setAttribute("aria-invalid", "true");
      describe(el, box.id, true);
    };
    const clear = (el: Control) => {
      const box = boxOf(el);
      if (box) { describe(el, box.id, false); box.remove(); }
      el.removeAttribute("aria-invalid");
    };

    let focusNext: Control | null = null;
    const onInvalid = (e: Event) => {
      if (!isControl(e.target)) return;
      e.preventDefault(); // no native bubble
      show(e.target);
      if (!focusNext) {
        focusNext = e.target;
        // All invalid events of one submit fire synchronously: focus the first after them.
        queueMicrotask(() => { focusNext?.focus(); focusNext = null; });
      }
    };
    const onEdit = (e: Event) => {
      const el = e.target;
      if (!isControl(el) || el.getAttribute("aria-invalid") !== "true" || !boxOf(el)) return;
      if (el.validity.valid) clear(el); else boxOf(el)!.textContent = message(el);
    };
    const onReset = (e: Event) => {
      if (!(e.target instanceof HTMLFormElement)) return;
      for (const el of Array.from(e.target.elements)) if (isControl(el)) clear(el);
    };

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("reset", onReset, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("reset", onReset, true);
    };
  }, [t]);

  return null;
}
