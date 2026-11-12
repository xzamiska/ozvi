// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { maskScreenshot } from "./shot-mask";

/** Text a screenshot would show: covered parts are transparent, so leave them out. */
function visible(root: Element): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) { if (!(n.parentElement?.closest("[data-ozvi-covered],[data-ozvi-mask]"))) out.push((n as Text).data); return; }
    n.childNodes.forEach(walk);
  };
  walk(root);
  return out.join("").replace(/\s+/g, " ").trim();
}
const page = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; document.body.replaceChildren(d); return d; };

describe("screenshot privacy", () => {
  it("covers e-mails and phones in text, keeps the rest", () => {
    const root = page(`<p>Client: Jana Kováčová, jana@firma.sk, +421 905 123 456</p><p>Class 18:00, 12. 11. 2026, 65,00 €</p>`);
    maskScreenshot(root);
    expect(visible(root)).toBe("Client: Jana Kováčová, , Class 18:00, 12. 11. 2026, 65,00 €");
    const boxes = root.querySelectorAll<HTMLElement>("[data-ozvi-covered]");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.style.getPropertyValue("color")).toBe("transparent");
  });

  it("never draws form values", () => {
    const root = page(`<input value="secret note"><input type="password" value="hunter2"><input type="checkbox" checked>
      <textarea>private text</textarea><select><option selected>VIP client</option></select><div contenteditable>draft</div>`);
    (root.querySelector("input") as HTMLInputElement).value = "typed later";
    maskScreenshot(root);
    const [text, pass, box] = Array.from(root.querySelectorAll("input"));
    expect(text!.value).toBe("•••••");
    expect(pass!.value).toBe("•••••");
    expect(box!.checked).toBe(true);
    expect(root.querySelector("textarea")!.value).toBe("•••••");
    expect(root.querySelector<HTMLElement>("select")!.style.getPropertyValue("color")).toBe("transparent");
    expect(root.querySelector<HTMLElement>("[contenteditable]")!.style.getPropertyValue("background")).not.toBe("");
  });

  it("covers [data-ozvi-mask] completely, media included", () => {
    const root = page(`<div data-ozvi-mask>Diagnosis: allergy <img src="x.png"><b>inner</b></div><p>Visible</p>`);
    maskScreenshot(root);
    const m = root.querySelector<HTMLElement>("[data-ozvi-mask]")!;
    expect(m.style.getPropertyValue("background")).not.toBe("");
    expect(m.querySelector("b")!.style.getPropertyValue("color")).toBe("transparent");
    expect(m.querySelector("img")!.style.getPropertyValue("visibility")).toBe("hidden");
    expect(visible(root)).toBe("Visible");
  });

  it('mode "all" covers everything except [data-ozvi-unmask]', () => {
    const root = page(`<h1>Invoice 2026-0412</h1><p>Total 120 €</p><nav data-ozvi-unmask>Settings <img src="logo.png"></nav><img src="photo.jpg">`);
    maskScreenshot(root, "all");
    expect(visible(root)).toBe("Settings");
    expect(root.querySelector<HTMLElement>('img[src="photo.jpg"]')!.style.getPropertyValue("visibility")).toBe("hidden");
    expect(root.querySelector<HTMLElement>('img[src="logo.png"]')!.style.getPropertyValue("visibility")).toBe("");
  });

  it("leaves scripts and styles alone", () => {
    const root = page(`<style>.a{color:red}</style><p>call 0905 123 456</p>`);
    maskScreenshot(root);
    expect(root.querySelector("style")!.textContent).toBe(".a{color:red}");
  });
});
