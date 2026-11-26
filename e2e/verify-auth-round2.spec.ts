import { test, expect, type Page } from "@playwright/test";
import { QA_ACCOUNTS, QA_PASSWORD, SKIP_REASON, signInAs } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.setTimeout(200_000);
const GO = { timeout: 200_000 };
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
// The clinic's own calendar day (Asia/Manila), not UTC.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const BRANCH = `VERIFY Branch ${today}`;
const DOCTOR = `VERIFY Doctor ${today}`;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type DayState = { day: (typeof DAYS)[number]; open: boolean; opens: string; closes: string };
type Pin = { latitude: string; longitude: string };

const sidebarLogos = (page: Page) => page.locator('img[src*="clinic-logos"]');
const branchSection = (page: Page) => page.locator(`section[aria-label="${BRANCH}"]`);

/** Creates this spec's own branch if it does not exist yet (no dependency on other specs). */
async function ensureBranch(page: Page) {
  await page.goto("/settings/branches", GO);
  if (await branchSection(page).count()) return;
  await page.getByRole("button", { name: "Add branch" }).click();
  await page.getByRole("dialog").getByLabel("Branch name").fill(BRANCH);
  await page.getByRole("dialog").getByRole("button", { name: "Add branch" }).click();
  await expect(page.getByText(BRANCH).first()).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(branchSection(page)).toBeVisible({ timeout: 60_000 });
}

/** Creates this spec's own doctor if it does not exist yet, and makes sure it is active. */
async function ensureDoctor(page: Page) {
  await page.goto("/settings/doctors", GO);
  if (await page.locator("li", { hasText: DOCTOR }).count()) {
    const activate = page.getByRole("button", { name: `Activate ${DOCTOR}` });
    if (await activate.count()) await activate.click();
    await expect(page.getByRole("button", { name: `Deactivate ${DOCTOR}` })).toBeVisible({ timeout: 120_000 });
    return;
  }
  await page.getByRole("button", { name: "Add doctor" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(DOCTOR);
  await page.getByRole("dialog").getByRole("button", { name: "Add doctor" }).click();
  await expect(page.getByText(DOCTOR).first()).toBeVisible({ timeout: 60_000 });
  await page.reload();
}

async function readHours(page: Page): Promise<DayState[]> {
  const sec = branchSection(page);
  const out: DayState[] = [];
  for (const day of DAYS) {
    out.push({
      day,
      open: await sec.getByLabel(day, { exact: true }).isChecked(),
      opens: await sec.getByLabel(`${day} opens`).inputValue(),
      closes: await sec.getByLabel(`${day} closes`).inputValue(),
    });
  }
  return out;
}

async function readPin(page: Page): Promise<Pin> {
  const sec = branchSection(page);
  return {
    latitude: await sec.locator('input[name="latitude"]').inputValue(),
    longitude: await sec.locator('input[name="longitude"]').inputValue(),
  };
}

async function restoreHours(page: Page, days: DayState[]) {
  await page.goto("/settings/branches", GO);
  const sec = branchSection(page);
  // Nothing to undo when the save never went through.
  if (JSON.stringify(await readHours(page)) === JSON.stringify(days)) return;
  for (const d of days) {
    await sec.getByLabel(`${d.day} opens`).fill(d.opens);
    await sec.getByLabel(`${d.day} closes`).fill(d.closes);
    await sec.getByLabel(d.day, { exact: true }).setChecked(d.open);
  }
  await sec.getByRole("button", { name: "Save hours" }).click();
  await expect(sec.getByText("Hours saved.")).toBeVisible({ timeout: 60_000 });
}

/** Puts the original pin back: cleared, or re-chosen through a mocked geocoder result. */
async function restorePin(page: Page, pin: Pin) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.goto("/settings/branches", GO);
  const sec = branchSection(page);
  if (pin.latitude && pin.longitude) {
    await page.route("**/api/geocoding/search*", (route) =>
      route.fulfill({
        json: [{ lat: pin.latitude, lon: pin.longitude, display_name: "VERIFY Original Pin" }],
      }),
    );
    await sec.getByLabel("Search address or place").fill("verify restore");
    await sec.getByRole("button", { name: "Search", exact: true }).click();
    await sec.getByRole("button", { name: "VERIFY Original Pin" }).click();
  } else if (await sec.getByRole("button", { name: "Clear pin" }).count()) {
    await sec.getByRole("button", { name: "Clear pin" }).click();
  }
  await sec.getByRole("button", { name: "Save branch" }).click();
  await page.waitForTimeout(3000);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload();
  expect(await readPin(page)).toEqual(pin);
}

test("safe redirects on auth callback and recovery", async ({ request }) => {
  const cases = [
    "/auth/callback",
    "/auth/callback?code=bad",
    "/auth/callback?code=bad&next=https://evil.example",
    "/auth/callback?next=//evil.example",
    "/auth/recovery",
    "/auth/recovery?code=bad&next=https://evil.example",
  ];
  for (const c of cases) {
    const res = await request.get(c, { maxRedirects: 0, timeout: 200_000 });
    expect(res.status(), c).toBeGreaterThanOrEqual(300);
    const loc = res.headers()["location"] ?? "";
    expect(loc, c).toMatch(/^(http:\/\/localhost:3000)?\/(login|forgot-password)/);
    expect(loc).not.toContain("evil");
  }
});

test("owner onboarding redirect, focus visibility, header search target", async ({ page }) => {
  await page.goto("/login", GO);
  const seen: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return true;
        const cs = getComputedStyle(el);
        return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none" || !!el.closest("label,div")?.matches("[class*=focus-within]");
      }),
    );
  }
  expect(seen.every(Boolean), `focus visible: ${seen}`).toBe(true);
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/onboarding", GO);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  const h = await page.getByRole("combobox", { name: /search patients/i }).evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    let best = 0;
    for (let i = 0; i < 3 && n; i++, n = n.parentElement) best = Math.max(best, n.getBoundingClientRect().height);
    return best;
  });
  expect(h).toBeGreaterThanOrEqual(43.5);
});

test("last owner cannot be demoted or removed", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/settings/staff", GO);
  const owners = await page.locator("ul li").getByText("Owner", { exact: true }).count();
  test.skip(owners !== 1, "more than one owner: not safe to try");
  const me = page.locator("li", { hasText: "(you)" });
  await me.getByRole("button", { name: /^Edit/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Role").selectOption("doctor");
  await dlg.getByRole("button", { name: "Save role" }).click();
  await expect(dlg.getByText("A clinic must keep at least one owner.")).toBeVisible({ timeout: 60_000 });
  await dlg.getByRole("button", { name: /^Remove/ }).click();
  await dlg.getByRole("button", { name: "Yes, remove" }).click();
  await expect(dlg.getByText("A clinic must keep at least one owner.").nth(1)).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.locator("li", { hasText: "(you)" }).getByText("Owner", { exact: true })).toBeVisible();
});

test("clinic details validation and logo upload, validation, remove", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/settings/clinic", GO);
  const name = page.getByLabel("Clinic name");
  const original = await name.inputValue();
  // Never save a valid-but-different name: only invalid input here (maxlength caps long input client-side).
  await expect(name).toHaveAttribute("maxlength", "120");
  await name.evaluate((el) => el.closest("form")?.setAttribute("novalidate", ""));
  await name.fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Enter the clinic name.")).toBeVisible({ timeout: 60_000 });
  await name.fill(original);
  await page.getByLabel("Clinic email").fill("not an email");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Website or public page").fill("ftp://nope");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/https:\/\/ or http/i)).toBeVisible({ timeout: 60_000 });

  await page.goto("/settings/clinic", GO);
  await page.waitForTimeout(3000); // let React hydrate before attaching files
  const fileInput = "#clinic-logo-input";
  const upload = page.getByRole("button", { name: "Upload logo" });
  // SVG renamed or not: rejected by magic-byte sniffing.
  await page.setInputFiles(fileInput, { name: "a.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await upload.click();
  await expect(page.getByText("Use a PNG, JPG or WebP image.")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000); // the same message can persist from the previous rejection; let the action settle and the form reset
  await page.setInputFiles(fileInput, { name: "fake.png", mimeType: "image/png", buffer: Buffer.from("hello not an image") });
  await upload.click();
  await expect(page.getByText("Use a PNG, JPG or WebP image.")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(4000); // the same message can persist from the previous rejection; let the action settle and the form reset
  await page.setInputFiles(fileInput, { name: "big.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 10)]) });
  await expect(page.getByText("The logo must be 1 MB or smaller.")).toBeVisible();
  // Real upload.
  await page.setInputFiles(fileInput, { name: "logo.png", mimeType: "image/png", buffer: PNG });
  await upload.click();
  await expect(page.getByText("Logo updated.")).toBeVisible({ timeout: 60_000 });
  await page.goto("/dashboard", GO);
  await expect(sidebarLogos(page).first()).toBeAttached({ timeout: 30_000 });
  await page.goto("/settings/clinic", GO);
  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByRole("button", { name: "Remove logo" })).toHaveCount(0, { timeout: 60_000 });
  await page.goto("/dashboard", GO);
  await expect(sidebarLogos(page)).toHaveCount(0);
});

test("dr-pill switch persists and visit value validates", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/settings/dr-pill", GO);
  const sw = page.getByRole("switch").first();
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(3000);
  await page.reload();
  const after = await page.getByRole("switch").first().getAttribute("aria-checked");
  expect(after).not.toBe(before);
  await page.getByRole("switch").first().click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(3000);
  await page.reload();
  expect(await page.getByRole("switch").first().getAttribute("aria-checked")).toBe(before);

  const visit = page.getByLabel("Typical value of one visit (PHP)");
  const original = await visit.inputValue();
  const save = page.getByRole("button", { name: "Save Chair-Filler settings" });
  for (const bad of ["abc", "-5", "999999999999"]) {
    await visit.fill(bad);
    await save.click();
    await expect(page.getByText("Enter a peso amount")).toBeVisible({ timeout: 60_000 });
  }
  await page.reload();
  await page.getByLabel("Typical value of one visit (PHP)").fill("1,500.50");
  await page.getByRole("button", { name: "Save Chair-Filler settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByLabel("Typical value of one visit (PHP)")).toHaveValue("1500.5");
  await page.getByLabel("Typical value of one visit (PHP)").fill(original);
  await page.getByRole("button", { name: "Save Chair-Filler settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible({ timeout: 60_000 });
});

test("branch hours validation and persistence, address search and pin", async ({ page }) => {
  test.setTimeout(480_000); // several saves plus cleanup on a slow dev server
  await signInAs(page, QA_ACCOUNTS.owner);
  await ensureBranch(page);
  const originalHours = await readHours(page);
  const originalPin = await readPin(page);
  let hoursChanged = false;
  let pinChanged = false;
  try {
    const sec = branchSection(page);
    await sec.getByLabel("Monday", { exact: true }).check();
    await sec.getByLabel("Monday opens").fill("17:00");
    await sec.getByLabel("Monday closes").fill("09:00");
    await sec.getByRole("button", { name: "Save hours" }).click();
    await expect(sec.getByText("Closing time must be after opening time.")).toBeVisible({ timeout: 60_000 });
    await sec.getByLabel("Monday opens").fill("08:30");
    await sec.getByLabel("Monday closes").fill("12:00");
    await sec.getByLabel("Sunday", { exact: true }).uncheck();
    hoursChanged = true;
    await sec.getByRole("button", { name: "Save hours" }).click();
    await expect(sec.getByText("Hours saved.")).toBeVisible({ timeout: 60_000 });
    await page.reload();
    const s2 = branchSection(page);
    await expect(s2.getByLabel("Monday opens")).toHaveValue("08:30");
    await expect(s2.getByLabel("Monday closes")).toHaveValue("12:00");
    await expect(s2.getByLabel("Sunday", { exact: true })).not.toBeChecked();

    // Geocoder mocked: empty, 502, 429, then a result.
    const search = s2.getByLabel("Search address or place");
    const mode: { v: "empty" | "502" | "429" | "ok" } = { v: "empty" };
    await page.route("**/api/geocoding/search*", (route) => {
      if (mode.v === "empty") return route.fulfill({ json: [] });
      if (mode.v === "502") return route.fulfill({ status: 502, json: { error: "Place search is temporarily unavailable." } });
      if (mode.v === "429") return route.fulfill({ status: 429, json: { error: "Please wait a moment before searching again." } });
      return route.fulfill({ json: [{ lat: "14.5995", lon: "120.9842", display_name: "VERIFY Manila Place" }] });
    });
    for (const m of ["empty", "502", "429"] as const) {
      mode.v = m;
      await search.fill(`verify ${m}`);
      await s2.getByRole("button", { name: "Search", exact: true }).click();
      await expect(s2.getByRole(m === "empty" ? "status" : "alert").or(s2.getByRole("status"))).toBeVisible({ timeout: 30_000 });
    }
    mode.v = "ok";
    await search.fill("verify ok");
    await s2.getByRole("button", { name: "Search", exact: true }).click();
    await s2.getByRole("button", { name: "VERIFY Manila Place" }).click();
    pinChanged = true;
    await s2.getByRole("button", { name: "Save branch" }).click();
    await page.waitForTimeout(3000);
    await page.reload();
    await expect(branchSection(page).getByRole("button", { name: "Clear pin" })).toBeVisible();
  } finally {
    if (hoursChanged) await restoreHours(page, originalHours);
    if (pinChanged) await restorePin(page, originalPin);
  }
});

test("doctor hours and activate/deactivate affects booking form", async ({ page }) => {
  test.setTimeout(480_000); // several saves plus cleanup on a slow dev server
  await signInAs(page, QA_ACCOUNTS.owner);
  await ensureBranch(page);
  await ensureDoctor(page);
  const doctorRow = () => page.locator("li", { hasText: DOCTOR });
  // The window this test adds, found by its own times (never .first()).
  const addedWindows = async () => {
    const all = doctorRow().locator("div.flex.flex-col.gap-2");
    const found = [];
    for (let i = 0; i < (await all.count()); i++) {
      const w = all.nth(i);
      if (
        (await w.locator('input[name="startsAt"]').inputValue()) === "15:00" &&
        (await w.locator('input[name="endsAt"]').inputValue()) === "18:00"
      )
        found.push(w);
    }
    return found;
  };
  let windowAdded = false;
  let deactivated = false;
  try {
    await doctorRow().locator("summary").click();
    const form = doctorRow().locator("form", { has: page.getByRole("button", { name: "Add", exact: true }) });
    await form.getByLabel("Starts").fill("15:00");
    await form.getByLabel("Ends").fill("10:00");
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await expect(doctorRow().getByText("End time must be after start time.")).toBeVisible({ timeout: 60_000 });
    const before = (await addedWindows()).length;
    // The form resets after an error: fill both times again.
    await form.getByLabel("Starts").fill("15:00");
    await form.getByLabel("Ends").fill("18:00");
    windowAdded = true;
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await expect(doctorRow().getByText("Weekly hours saved.")).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await doctorRow().locator("summary").click();
    await expect.poll(async () => (await addedWindows()).length, { timeout: 60_000 }).toBe(before + 1);
    await (await addedWindows()).at(-1)!.getByRole("button", { name: "Remove window" }).click();
    await expect.poll(async () => (await addedWindows()).length, { timeout: 60_000 }).toBe(before);
    windowAdded = false;

    deactivated = true;
    await page.getByRole("button", { name: `Deactivate ${DOCTOR}` }).click();
    await expect(page.getByRole("button", { name: `Activate ${DOCTOR}` })).toBeVisible({ timeout: 60_000 });
    await page.goto("/appointments", GO);
    await page.getByRole("button", { name: "New appointment" }).click();
    await expect(page.getByRole("dialog").getByText(DOCTOR)).toHaveCount(0);
  } finally {
    await page.goto("/settings/doctors", GO);
    if (windowAdded) {
      await doctorRow().locator("summary").click();
      const leftover = (await addedWindows()).at(-1);
      if (leftover) {
        await leftover.getByRole("button", { name: "Remove window" }).click();
        await page.waitForTimeout(3000);
      }
    }
    const activate = page.getByRole("button", { name: `Activate ${DOCTOR}` });
    if (deactivated || (await activate.count())) {
      if (await activate.count()) await activate.click();
      await expect(page.getByRole("button", { name: `Deactivate ${DOCTOR}` })).toBeVisible({ timeout: 120_000 });
    }
  }
});
