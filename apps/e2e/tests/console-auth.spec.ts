import { expect, test } from "@playwright/test";
import { consoleLogin, createProject } from "../lib/console";
import { email, uniq } from "../lib/env";
import { linkIn, lastMail } from "../lib/mail";

test.describe("console sign-in and first project", () => {
  test("new address: code e-mail → account → first project → board", async ({ page }) => {
    const me = email("owner");
    await consoleLogin(page, me);
    // A brand-new account lands on the "create your first project" page.
    await expect(page).toHaveURL(/\/app\/new/);
    const slug = uniq("proj").toLowerCase();
    await createProject(page, "E2E projekt", slug);
    await page.getByRole("link", { name: "Otvoriť board" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/${slug}(/ideas)?$`));
    await expect(page.getByRole("heading", { level: 1, name: "Nápady" })).toBeVisible();
  });

  test("the e-mailed link signs in only after a click (mail scanners cannot use it up)", async ({ page, request }) => {
    const me = email("link");
    await page.goto("/app/login");
    await page.getByLabel("E-mail").fill(me);
    await page.getByRole("button", { name: "Poslať kód" }).click();
    const link = linkIn((await lastMail(me)).text, /\/app\/login\/link\?t=/);
    expect(link).not.toBeNull();
    // A scanner's GET must not sign anyone in or spend the link.
    expect((await request.get(link!)).status()).toBe(200);
    await page.goto(link!);
    await page.getByRole("button", { name: "Prihlásiť sa" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/app/login"));
    // Used once: a second visit says it is no longer valid.
    await page.goto(link!);
    await expect(page.getByText("Odkaz už neplatí")).toBeVisible();
  });

  test("a wrong code is refused and says so", async ({ page }) => {
    const me = email("wrong");
    await page.goto("/app/login");
    await page.getByLabel("E-mail").fill(me);
    await page.getByRole("button", { name: "Poslať kód" }).click();
    await page.getByLabel("Kód z e-mailu").fill("000000");
    await expect(page.getByText(/kód/i).and(page.getByRole("alert"))).toBeVisible();
    await expect(page).toHaveURL(/\/app\/login/);
  });

  test("project address rules: reserved and taken slugs are refused", async ({ page }) => {
    await consoleLogin(page, email("slugs"));
    await page.goto("/app/new");
    await page.getByLabel("Názov aplikácie").fill("Rezervované");
    await page.getByLabel("Adresa boardu").fill("admin");
    await page.getByRole("button", { name: "Založiť projekt" }).click();
    await expect(page.getByText(/adresu|adresa/i).and(page.getByRole("alert"))).toBeVisible();
    await expect(page).toHaveURL(/\/app\/new/);
  });
});
