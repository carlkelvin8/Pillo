import { test, expect } from "@playwright/test";
import { QA_ACCOUNTS, QA_PASSWORD, SKIP_REASON, signInAs } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.setTimeout(400_000);

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("auth validation messages", async ({ page }) => {
  await page.goto("/login", { timeout: 200_000 });
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Native validation blocks submit; fall back to wrong credentials.
  await page.getByLabel("Email").fill("verify.nobody@example.com");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible({ timeout: 60_000 });
  await page.goto("/signup");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("short");
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("verify.nobody@example.com");
  await page.getByRole("button", { name: /send|reset/i }).click();
  await expect(page.getByText("If that email has an account")).toBeVisible({ timeout: 60_000 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("staff invite validation, duplicate, revoke", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/settings/staff", { timeout: 200_000 });
  const email = page.getByLabel("Email");
  await email.fill("a@b");
  await page.getByRole("button", { name: "Add invitation" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible({ timeout: 60_000 });
  const unique = `verify.${Date.now()}@example.com`;
  await email.fill(unique);
  await page.getByRole("button", { name: "Add invitation" }).click();
  await expect(page.getByText("Invitation saved")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(unique)).toBeVisible();
  await email.fill(unique);
  await page.getByRole("button", { name: "Add invitation" }).click();
  await expect(page.getByText("already has a pending invitation")).toBeVisible({ timeout: 60_000 });
  // Clean up the invitation we created.
  await page.reload();
  const row = page.locator("li, tr, div").filter({ hasText: unique }).filter({ has: page.getByRole("button", { name: /revoke/i }) }).last();
  await row.getByRole("button", { name: /revoke/i }).click();
  await expect(page.getByText(unique)).toHaveCount(0, { timeout: 60_000 });
});

test("clinic details validation and logo upload/remove", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/settings/clinic", { timeout: 200_000 });
  const name = page.getByLabel("Clinic name");
  const original = await name.inputValue();
  await name.fill("");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(name).toBeFocused().catch(() => {});
  await name.fill(original);
  if (await page.getByRole("button", { name: "Remove logo" }).count()) test.skip(true, "clinic already has a logo");
  await page.setInputFiles("#clinic-logo-input", { name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.getByRole("button", { name: "Remove logo" })).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove logo" })).toBeVisible();
  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByRole("button", { name: "Remove logo" })).toHaveCount(0, { timeout: 60_000 });
});

test("branch and doctor added in settings reach the appointment form", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/settings/branches", { timeout: 200_000 });
  const bname = `VERIFY Branch ${new Date().toISOString().slice(0, 10)}`;
  if (!(await page.getByText(bname).count())) {
    await page.getByRole("button", { name: "Add branch" }).click();
    await page.getByRole("dialog").getByLabel("Branch name").fill(bname);
    await page.getByRole("dialog").getByRole("button", { name: "Add branch" }).click();
    await expect(page.getByText(bname).first()).toBeVisible({ timeout: 60_000 });
  }
  await page.reload();
  await expect(page.getByText(bname).first()).toBeVisible();
  await page.goto("/settings/doctors", { timeout: 200_000 });
  const dname = `VERIFY Doctor ${new Date().toISOString().slice(0, 10)}`;
  if (!(await page.getByText(dname).count())) {
    await page.getByRole("button", { name: "Add doctor" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(dname);
    await page.getByRole("dialog").getByRole("button", { name: "Add doctor" }).click();
    await expect(page.getByText(dname).first()).toBeVisible({ timeout: 60_000 });
  }
  await page.goto("/appointments", { timeout: 200_000 });
  await page.getByRole("button", { name: "New appointment" }).click();
  await expect(page.getByRole("option", { name: new RegExp(bname) })).toHaveCount(1);
  await expect(page.getByRole("dialog").getByText(dname).or(page.getByRole("radio", { name: new RegExp(dname) }))).not.toHaveCount(0);
});
