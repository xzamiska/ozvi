import { expect, type Page } from "@playwright/test";
import { codeIn, lastMail } from "./mail";

/** Signs in to the console (/app) with the e-mailed 6-digit code, as a person would. New addresses get an account. */
export async function consoleLogin(page: Page, email: string) {
  await page.goto("/app/login");
  await page.getByLabel("E-mail").fill(email);
  const sentAt = Date.now();
  await page.getByRole("button", { name: "Poslať kód" }).click();
  await expect(page.getByText(`Poslali sme kód na ${email}`)).toBeVisible();
  const mail = await lastMail(email, { subject: /kód|prihlás/i });
  expect(new Date(mail.Created).getTime()).toBeGreaterThan(sentAt - 60_000);
  const code = codeIn(mail.text);
  expect(code, "6-digit code in the e-mail").not.toBeNull();
  await page.getByLabel("Kód z e-mailu").fill(code!);
  // Six digits submit the form by themselves; the button is the fallback.
  await page.waitForURL((u) => !u.pathname.startsWith("/app/login"), { timeout: 5_000 }).catch(async () => {
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/app/login"));
  });
}

/** Creates a project from the console form; returns its slug. A first project also creates a free workspace. */
export async function createProject(page: Page, name: string, slug: string) {
  // A new account is redirected to /app/new right after sign-in; going there ourselves at the same
  // moment makes WebKit report "navigation interrupted", so only navigate when not there yet.
  await page.waitForLoadState("load");
  if (!new URL(page.url()).pathname.startsWith("/app/new")) {
    await page.goto("/app/new").catch(async (e: Error) => {
      if (!/interrupted by another navigation/.test(e.message)) throw e;
      await page.waitForURL(/\/app\/new/);
    });
  }
  await page.getByLabel("Názov aplikácie").fill(name);
  const s = page.getByLabel("Adresa boardu");
  await s.fill(slug);
  await page.getByRole("button", { name: "Založiť projekt" }).click();
  // The form shows the address as a live preview, so wait for the console page of the new project instead.
  await page.waitForURL(/\/app\/w\/[0-9a-f-]{36}/);
  await expect(page.getByText(`e2e.localhost:3410/${slug}`).first()).toBeVisible();
  return slug;
}

/** The current workspace id from a console URL (/app/w/<id>/…). */
export function workspaceId(page: Page): string {
  const m = page.url().match(/\/app\/w\/([0-9a-f-]{36})/);
  if (!m) throw new Error(`not on a workspace page: ${page.url()}`);
  return m[1]!;
}
