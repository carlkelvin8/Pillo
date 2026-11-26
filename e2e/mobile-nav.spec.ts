import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, QA_PASSWORD, signIn, SKIP_REASON } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.use({ viewport: { width: 375, height: 812 } });

const ROUTES = [
  "Dashboard",
  "Appointments",
  "Patients",
  "Payment records",
  "Invoices",
  "Dr. Pill",
  "Integrations",
  "Settings",
];

test("flow 3: phone drawer reaches every sidebar page without sideways scroll", async ({ page }) => {
  await signIn(page);
  await expectNoHorizontalOverflow(page);
  for (const label of ROUTES) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page);
  }
});
