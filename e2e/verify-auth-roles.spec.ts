import { test, expect } from "@playwright/test";
import { QA_ACCOUNTS, QA_PASSWORD, SKIP_REASON, signInAs } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.setTimeout(300_000);

const SETTINGS = ["clinic", "staff", "branches", "doctors", "notifications", "dr-pill", "subscription"];

for (const role of ["receptionist", "doctor"] as const) {
  test(`${role} cannot open settings`, async ({ page }) => {
    await signInAs(page, QA_ACCOUNTS[role]);
    for (const s of SETTINGS) {
      await page.goto(`/settings/${s}`, { timeout: 200_000 });
      await expect(page, `/settings/${s}`).toHaveURL(/\/dashboard/, { timeout: 60_000 });
    }
    await expect(page.getByRole("link", { name: /settings/i })).toHaveCount(0);
  });
}

test("owner sees all settings pages", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  for (const s of SETTINGS) {
    await page.goto(`/settings/${s}`, { timeout: 200_000 });
    await expect(page, `/settings/${s}`).toHaveURL(new RegExp(`/settings/${s}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  }
});
