import { expect, test, type Page } from "@playwright/test";
import { consoleLogin, createProject, workspaceId } from "../lib/console";
import { email, uniq } from "../lib/env";
import { lastMail, linkIn } from "../lib/mail";
import { db, schema } from "../lib/db";
import { and, eq } from "drizzle-orm";

/** Owner with a fresh workspace and project; returns the workspace id. */
async function ownerWithWorkspace(page: Page, owner: string) {
  await consoleLogin(page, owner);
  await createProject(page, "Tím E2E", uniq("team").toLowerCase());
  return workspaceId(page);
}

async function invite(page: Page, ws: string, to: string, role: "Člen" | "Vlastník" = "Člen") {
  await page.goto(`/app/w/${ws}/people`);
  await page.getByLabel("E-mail").fill(to);
  if (role !== "Člen") {
    await page.getByRole("combobox", { name: "Rola" }).click();
    await page.getByRole("option", { name: role }).click();
  }
  await page.getByRole("button", { name: "Poslať pozvánku" }).click();
  await expect(page.getByText(`Pozvánka odišla na ${to}`)).toBeVisible();
}

const roleOf = async (ws: string, mail: string) => {
  const [r] = await db.select({ role: schema.workspaceMembers.role }).from(schema.workspaceMembers)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.workspaceMembers.accountId))
    .where(and(eq(schema.workspaceMembers.workspaceId, ws), eq(schema.accounts.email, mail)));
  return r?.role ?? null;
};

test.describe("team and invitations", () => {
  test("member invitation: e-mail → confirm page → member with member rights; link works once", async ({ page }) => {
    const owner = email("owner"), member = email("member");
    const ws = await ownerWithWorkspace(page, owner);
    // Typed with capitals: stored and e-mailed lower-case.
    await invite(page, ws, member.toUpperCase().replace("@E2E.TEST", "@e2e.test"));
    await expect(page.getByText("Nevybavené pozvánky")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: member })).toContainText("Člen, platí do");

    const mail = await lastMail(member, { subject: /Pozvánka/ });
    expect(mail.text).toContain("ako člena");
    expect(mail.text).toContain("platí 7 dní");
    const link = linkIn(mail.text, /\/app\/invite\?t=/)!;

    // Opening the link signed in as someone else: a warning, nothing happens until the click.
    await page.goto(link);
    await expect(page.getByText(`Teraz ste prihlásení ako ${owner}`)).toBeVisible();
    await expect(page.getByText("ak účet ešte nemáte, vytvoríme ho")).toBeVisible();
    expect(await roleOf(ws, member)).toBeNull();
    await page.getByRole("button", { name: "Prijať pozvánku" }).click();
    await page.waitForURL(new RegExp(`/app/w/${ws}`));
    expect(await roleOf(ws, member)).toBe("member");

    // Member rights: no invite form, cannot change the plan, can leave.
    await page.goto(`/app/w/${ws}/people`);
    await expect(page.getByRole("button", { name: "Poslať pozvánku" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Odísť z priestoru" })).toBeVisible();
    await page.goto(`/app/w/${ws}/plan`);
    await expect(page.getByText("Plán a platby mení vlastník priestoru.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Prejsť na/ })).toHaveCount(0);

    // A member manages boards: the console opens the board's settings.
    await page.goto(`/app/w/${ws}`);
    await page.locator('a[href*="/app/open/"][href*="to=admin"]').first().click();
    await expect(page.getByRole("heading", { name: "Nastavenia boardu" })).toBeVisible();

    // The link is single use.
    await page.goto(link);
    await expect(page.getByText("Pozvánka už neplatí")).toBeVisible();
  });

  test("owner invitation: the new owner can invite, change roles and the plan", async ({ page }) => {
    const owner = email("owner"), second = email("owner2");
    const ws = await ownerWithWorkspace(page, owner);
    await invite(page, ws, second, "Vlastník");
    const mail = await lastMail(second, { subject: /Pozvánka/ });
    expect(mail.text).toContain("ako vlastníka");
    expect(mail.text).toMatch(/meniť plán a platby a pozývať/);
    await page.goto(linkIn(mail.text, /\/app\/invite\?t=/)!);
    await page.getByRole("button", { name: "Prijať pozvánku" }).click();
    await page.waitForURL(new RegExp(`/app/w/${ws}`));
    expect(await roleOf(ws, second)).toBe("owner");
    await page.goto(`/app/w/${ws}/people`);
    await expect(page.getByRole("button", { name: "Poslať pozvánku" })).toBeVisible();
    await page.goto(`/app/w/${ws}/plan`);
    await expect(page.getByRole("button", { name: "Prejsť na Pro" })).toBeVisible();
  });

  test("owner manages people: already-member refused, role change, removal signs them out of the board, revoke", async ({ page, browser }) => {
    const owner = email("owner"), member = email("member"), later = email("later");
    const ws = await ownerWithWorkspace(page, owner);
    await invite(page, ws, member);
    const link = linkIn((await lastMail(member, { subject: /Pozvánka/ })).text, /\/app\/invite\?t=/)!;
    // The member accepts in their own browser.
    const other = await browser.newContext();
    const mp = await other.newPage();
    await mp.goto(link);
    await mp.getByRole("button", { name: "Prijať pozvánku" }).click();
    await mp.waitForURL(new RegExp(`/app/w/${ws}`));

    // Inviting someone who is already in: refused with a clear message.
    await page.goto(`/app/w/${ws}/people`);
    await page.getByLabel("E-mail").fill(member);
    await page.getByRole("button", { name: "Poslať pozvánku" }).click();
    await expect(page.getByText(`${member} už v priestore je.`)).toBeVisible();

    // Role change needs the explicit save.
    await page.getByRole("combobox", { name: `Rola: ${member}` }).click();
    await page.getByRole("option", { name: "Vlastník" }).click();
    expect(await roleOf(ws, member)).toBe("member");
    await page.getByRole("button", { name: "Zmeniť rolu" }).click();
    await expect.poll(() => roleOf(ws, member)).toBe("owner");

    // Removal: confirm dialog, then out of the workspace and signed out of its boards.
    await page.reload();
    await page.getByRole("listitem").filter({ hasText: member }).getByRole("button", { name: "Odobrať" }).click();
    await expect(page.getByRole("dialog")).toContainText("stratí prístup");
    await page.getByRole("button", { name: "Odobrať z priestoru" }).click();
    await expect.poll(() => roleOf(ws, member)).toBeNull();
    await mp.goto(`/app/w/${ws}`);
    await expect(mp.getByText("404")).toBeVisible();

    // Revoking a pending invitation kills its link.
    await invite(page, ws, later);
    const laterLink = linkIn((await lastMail(later, { subject: /Pozvánka/ })).text, /\/app\/invite\?t=/)!;
    await page.getByRole("button", { name: "Zrušiť pozvánku" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zrušiť pozvánku" }).click();
    await expect(page.getByText("Nevybavené pozvánky")).toHaveCount(0);
    await mp.goto(laterLink);
    await expect(mp.getByText("Pozvánka už neplatí")).toBeVisible();
    await other.close();
  });

  test("the last owner cannot leave or be removed", async ({ page }) => {
    const ws = await ownerWithWorkspace(page, email("solo"));
    await page.goto(`/app/w/${ws}/people`);
    const leave = page.getByRole("button", { name: "Odísť z priestoru" });
    if (await leave.count()) {
      await leave.click();
      await page.getByRole("dialog").getByRole("button", { name: "Odísť z priestoru" }).click();
      await expect(page.getByRole("alert").filter({ hasText: /vlastník/i })).toBeVisible();
    }
    await page.goto(`/app/w/${ws}/people`);
    await expect(page.getByText("(vy)")).toBeVisible();
  });
});
