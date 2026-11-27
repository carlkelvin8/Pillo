import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, QA_PASSWORD, SKIP_REASON, signIn } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);

test.describe("desktop shell", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("sidebar collapse persists, search, bell, companion, sign out", async ({ page }) => {
    await signIn(page);
    const toggle = page.getByRole("button", { name: "Toggle sidebar width" });
    await toggle.click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(await page.evaluate(() => localStorage.getItem("pillo.sidebar"))).toBe("compact");
    await page.reload();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-sidebar-collapsed", "true");
    // compact mode: nav links still at least 44px and named
    const link = page.getByRole("link", { name: "Patients", exact: true }).first();
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
    expect(box!.width).toBeGreaterThanOrEqual(43.5);
    await toggle.click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-sidebar-collapsed", "false");

    // active item
    await page.goto("/patients");
    await expect(page.locator("aside").getByRole("link", { name: "Patients", exact: true })).toHaveAttribute("aria-current", "page");

    // search: no-match state, then real hit, keyboard nav
    const search = page.getByRole("combobox", { name: "Search patients and invoices" });
    await search.fill("zzzqq");
    await expect(page.getByText("No matches.").first()).toBeVisible();
    await search.fill("");
    await search.fill("an");
    await expect(page.getByRole("option").first()).toBeVisible();
    const first = await page.getByRole("option").first().locator("span").nth(1).innerText();
    await search.press("ArrowDown");
    await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(first.split(" ")[0]!);
    await search.fill("INV-1");
    await page.getByRole("option").first().waitFor({ timeout: 10_000 }).catch(() => {});
    await search.press("Escape");
    await expect(page.getByRole("listbox")).toBeHidden();

    // bell
    await page.getByRole("button", { name: /^Notifications/ }).click();
    const dlg = page.getByRole("dialog", { name: "Notifications" });
    await expect(dlg).toBeVisible();
    const links = dlg.getByRole("link");
    if (await links.count()) {
      const href = await links.first().getAttribute("href");
      await links.first().click();
      await expect(page).toHaveURL(new RegExp(href!.split("?")[0]!));
    } else await page.keyboard.press("Escape");

    // companion
    await page.getByRole("button", { name: "Open Dr. Pill help" }).click();
    await expect(page.getByRole("region", { name: "Dr. Pill help" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Dr. Pill help" })).toBeHidden();

    // sign out
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/(login)?$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("404 for signed-in user", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
  });
});

test.describe("phone shell", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("drawer focus, Escape, bell sheet", async ({ page }) => {
    await signIn(page);
    const open = page.getByRole("button", { name: "Open menu" });
    await open.click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
    await expect(open).toBeFocused();

    await page.getByRole("button", { name: /^Notifications/ }).click();
    const sheet = page.getByRole("dialog", { name: "Notifications" });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(600); // let the zoom-in animation finish
    // Bottom sheet: full width of the layout viewport (360 when headless Chromium shows a 15px classic scrollbar), docked to the bottom.
    const b = await sheet.evaluate((el) => {
      const h = el as HTMLElement;
      return { width: h.offsetWidth, bottom: h.getBoundingClientRect().bottom };
    });
    expect(b.width).toBeGreaterThanOrEqual(355);
    expect(b.bottom).toBeGreaterThanOrEqual(811);
    await expectNoHorizontalOverflow(page);
  });
});

test("public pages", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const path of ["/", "/styleguide", "/login"]) {
    await page.goto(path);
    await expect(page).toHaveTitle(/Pillo/);
  }
  const man = await page.request.get("/manifest.webmanifest");
  expect(man.ok()).toBe(true);
  const j = await man.json();
  for (const icon of j.icons) expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);
  expect((await page.request.get("/icon.svg")).ok()).toBe(true);
  expect((await page.request.get("/apple-icon.png")).ok()).toBe(true);
  expect(errs).toEqual([]);
});
