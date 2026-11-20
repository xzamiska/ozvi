import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANDING_CLIENT_NAMESPACES } from "./landing-messages";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("landing client messages", () => {
  // The landing gives its client parts their own provider in the page's language; a namespace missing
  // from the list would show raw keys there.
  it("cover every namespace the landing's client components read", () => {
    // Shared UI the landing renders (sheets and dialogs: the close button's label).
    const files = [...readdirSync(join(SRC, "components/landing")).map((f) => `components/landing/${f}`), "components/ozvi/route.tsx",
      "components/ui/dialog.tsx", "components/ui/sheet.tsx"];
    const used = new Set(files.flatMap((f) => [...read(f).matchAll(/useTranslations\("([a-zA-Z0-9]+)/g)].map((m) => m[1]!)));
    expect(used.size).toBeGreaterThan(0);
    for (const n of used) expect(LANDING_CLIENT_NAMESPACES as readonly string[]).toContain(n);
  });

  it("the landing wraps its client parts in a provider of its own locale", () => {
    expect(read("app/Landing.tsx")).toMatch(/<NextIntlClientProvider locale=\{locale\} messages=\{messages\}>/);
  });
});
