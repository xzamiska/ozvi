import { expect, type Page } from "@playwright/test";

/**
 * Collects what a visitor's browser would complain about: console errors and uncaught exceptions.
 * Call before the first navigation; read `errors` at the end.
 */
export function watchErrors(page: Page, ignore: RegExp[] = []) {
  const errors: string[] = [];
  const skip = (s: string) => ignore.some((r) => r.test(s));
  page.on("console", (m) => {
    if (m.type() === "error" && !skip(m.text())) errors.push(`console: ${m.text()} (${m.location().url})`);
  });
  page.on("pageerror", (e) => {
    if (!skip(e.message)) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

/** The page is wider than the viewport (sideways scrolling on a phone). Returns the overflow in px. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
}

/** The elements that stick out to the right of the viewport (for a readable failure message). */
export async function overflowingElements(page: Page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    return [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > w + 1)
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 3).join(".")} → ${Math.round(el.getBoundingClientRect().right)}px`);
  });
}

/** One <h1> that is visible and not empty. */
export async function expectHeading(page: Page) {
  const h1 = page.locator("h1").first();
  await expect(h1).toBeVisible();
  expect((await h1.innerText()).trim().length).toBeGreaterThan(1);
}
