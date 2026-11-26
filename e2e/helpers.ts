import { existsSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const QA_EMAIL = "qa.owner1@example.com";
/** From the gitignored .env.local (written by `pnpm seed:qa --yes`). Never hard-code it. */
export const QA_PASSWORD = process.env.QA_SEED_PASSWORD;
export const SKIP_REASON = "QA_SEED_PASSWORD is missing: run `pnpm seed:qa --yes` first.";

export const QA_ACCOUNTS = {
  owner: "qa.owner1@example.com",
  receptionist: "qa.recep1@example.com",
  doctor: "qa.doc1@example.com",
} as const;

/** Signs in as one of the seeded QA accounts (same password for all, from .env.local). */
export async function signInAs(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(QA_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Picks a patient in the search-as-you-type PatientPicker. */
export async function pickPatient(page: Page, name: string) {
  await page.getByPlaceholder("Search by name or phone").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
}
