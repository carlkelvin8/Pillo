import { expect, test } from "@playwright/test";
import { pickPatient, QA_PASSWORD, signIn, SKIP_REASON } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.describe.configure({ mode: "serial" });

const patientName = `E2E Patient ${Date.now()}`;

test("flow 1: add a patient and book an appointment", async ({ page }) => {
  await signIn(page);

  await page.goto("/patients");
  await page.getByRole("button", { name: "Add patient" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(patientName);
  await dialog.getByLabel("Phone").fill("09171234567");
  await dialog.getByRole("button", { name: "Add patient" }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}/);
  const patientUrl = page.url();
  await expect(page.getByRole("heading", { name: patientName })).toBeVisible();

  await page.goto("/appointments");
  await page.getByRole("button", { name: "New appointment" }).click();
  const booking = page.getByRole("dialog");
  await pickPatient(page, patientName);
  await expect(booking.getByText("Finding open times…")).toBeHidden({ timeout: 30_000 });
  // Earlier runs fill the first open days, so book on the last offered date, which is free.
  await booking.getByRole("group", { name: "Date" }).getByRole("button").last().click();
  await expect(booking.getByText("Finding open times…")).toBeHidden({ timeout: 30_000 });
  const firstTime = booking.getByRole("group", { name: "Time" }).getByRole("button").first();
  await expect(firstTime, "needs an open slot: set branch hours and a doctor").toBeVisible();
  await firstTime.click();
  await booking.getByLabel("Reason").fill("E2E check-up");
  await booking.getByRole("button", { name: "Book appointment" }).click();
  await expect(booking).toBeHidden({ timeout: 30_000 });
  // The slot is on a later day than the calendar shows, so confirm it on the patient's record.
  await page.goto(patientUrl);
  await expect(page.getByText("E2E check-up").first()).toBeVisible();
});

test("flow 2: invoice, cash payment, paid and listed in payments", async ({ page }) => {
  await signIn(page);

  await page.goto("/invoices/new");
  await pickPatient(page, patientName);
  await page.getByLabel("Description").fill("E2E consultation");
  await page.getByLabel("Price (₱)").fill("500");
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount received (₱)").fill("500");
  await dialog.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Paid in full")).toBeVisible({ timeout: 30_000 });

  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Payment records" })).toBeVisible();
  await expect(page.getByText(patientName).first()).toBeVisible();
});
