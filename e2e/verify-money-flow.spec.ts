import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, pickPatient, QA_ACCOUNTS, QA_PASSWORD, SKIP_REASON } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const bad: string[] = [];
function watch(page: Page) {
  page.on("pageerror", (e) => bad.push("pageerror " + e.message.slice(0, 120)));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("/api/invoices/")) bad.push(`${r.status()} ${r.url()}`);
  });
}
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(QA_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 120_000 });
}
const centsOf = (s: string) => Math.round(parseFloat(s.replace(/[^\d.]/g, "")) * 100);
async function tileCents(page: Page, label: string) {
  const t = page.getByText(label, { exact: true }).first().locator("xpath=..");
  return centsOf((await t.innerText()).split("\n").find((l) => l.includes("₱")) ?? "0");
}

let invoiceUrl = "";

test("create invoice: validation, totals, send", async ({ page }) => {
  watch(page);
  await login(page, QA_ACCOUNTS.owner);
  await page.goto("/invoices/new");
  await expectNoHorizontalOverflow(page);
  // empty submit
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page.getByText(/Choose a patient|Add at least one item/).first()).toBeVisible({ timeout: 60_000 });
  console.log("EMPTY:", (await page.locator("main").innerText()).match(/(Choose a patient|Add at least one item|check the highlighted)[^\n]*/g));
  await pickPatient(page, "QA Validation Patient 01");
  await page.locator("input[name=itemDescription]").first().fill("VERIFY consult");
  await page.locator("input[name=itemPrice]").first().fill("1000.505");
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page.getByText(/enter an amount like/i).first()).toBeVisible({ timeout: 60_000 });
  await page.locator("input[name=itemPrice]").first().fill("-5");
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page.getByText(/enter an amount like/i).first()).toBeVisible({ timeout: 60_000 });
  await page.locator("input[name=itemPrice]").first().fill("1,000.10");
  await page.locator("input[name=itemQuantity]").first().fill("0");
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page.getByText(/at least 1/i).first()).toBeVisible({ timeout: 60_000 });
  await page.locator("input[name=itemQuantity]").first().fill("1.5");
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page.getByText(/whole number/i).first()).toBeVisible({ timeout: 60_000 });
  await page.locator("input[name=itemQuantity]").first().fill("2");
  await page.getByRole("button", { name: "Add line item" }).click();
  await page.locator("input[name=itemDescription]").nth(1).fill("VERIFY second");
  await page.locator("input[name=itemPrice]").nth(1).fill("0.10");
  await page.getByLabel("Discount (₱)").fill("0.05");
  await page.getByLabel("Tax (₱)").fill("10");
  // 2*1000.10 + 0.10 = 2000.30 - 0.05 + 10 = 2010.25
  await expect(page.locator("p[aria-live=polite]:not(.sr-only)").first()).toHaveText("₱2,010.25");
  // remove 2nd and re-add
  await page.getByRole("button", { name: "Remove item 2" }).click();
  await expect(page.locator("p[aria-live=polite]:not(.sr-only)").first()).toHaveText("₱2,010.15");
  // discount > subtotal
  await page.getByLabel("Discount (₱)").fill("99999");
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page.getByText(/Discount cannot be more/i).first()).toBeVisible({ timeout: 60_000 });
  // due before issue
  await page.getByLabel("Discount (₱)").fill("0.05");
  await page.getByLabel("Due date").fill("2020-01-01");
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page.getByText(/Due date cannot be before/i).first()).toBeVisible({ timeout: 60_000 });
  console.log("values kept after error:", await page.getByLabel("Tax (₱)").inputValue(), await page.locator("input[name=itemDescription]").first().inputValue());
  const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  await page.getByLabel("Due date").fill(due);
  await page.getByRole("button", { name: "Create and send" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 60_000 });
  invoiceUrl = page.url();
  const body = await page.locator("main").innerText();
  console.log("INVOICE:", body.replace(/\n+/g, " | ").slice(0, 900));
  expect(body).toContain("₱2,000.20");
  expect(body).toContain("₱2,010.15");
  await expectNoHorizontalOverflow(page);
});

test("record payments: negatives, partial, overpay, pdf, void rules", async ({ page }) => {
  watch(page);
  await login(page, QA_ACCOUNTS.owner);
  await page.goto(invoiceUrl);
  await page.getByRole("button", { name: "Record payment" }).click();
  const d = page.getByRole("dialog");
  const submit = async (amount: string, extra?: () => Promise<void>) => {
    await d.getByLabel("Amount received (₱)").fill(amount);
    if (extra) await extra();
    await d.getByRole("button", { name: "Record payment" }).click();
  };
  for (const [amt, re] of [["0", /Enter the amount|amount like/i], ["-10", /amount like/i], ["10.123", /amount like/i], ["abc", /amount like/i], ["999999999999", /amount like|more than/i], ["3000", /more than/i]] as const) {
    await submit(amt);
    await expect(d.getByRole("button", { name: "Record payment" })).toBeEnabled({ timeout: 60_000 });
    await expect(d.getByLabel("Amount received (₱)")).toHaveValue(amt, { timeout: 60_000 });
    await expect(d.getByText(re).first(), `amount ${amt}`).toBeVisible({ timeout: 60_000 });
  }
  // future date
  const fut = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  await submit("10", async () => { await d.getByLabel("Date received").evaluate((el: HTMLInputElement, v) => { el.removeAttribute("max"); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, fut); });
  await expect(d.getByText(/cannot be in the future/i)).toBeVisible({ timeout: 60_000 });
  // before invoice date
  await submit("10", async () => { await d.getByLabel("Date received").fill("2019-01-01"); });
  await expect(d.getByText(/before the invoice date/i)).toBeVisible({ timeout: 60_000 });
  // partial 500.25 GCash with reference
  await d.getByLabel("Method").selectOption("gcash");
  await submit("500.25", async () => { await d.getByLabel("Date received").fill(new Date().toISOString().slice(0, 10)); await d.getByLabel(/Reference/).fill("VERIFY ref 1"); });
  await expect(d).toBeHidden({ timeout: 60_000 });
  let body = await page.locator("main").innerText();
  console.log("AFTER PARTIAL:", body.replace(/\n+/g, " | ").slice(-700));
  expect(body).toContain("₱1,509.90");
  expect(body).toContain("VERIFY ref 1");
  // void must be unavailable with payment
  await expect(page.getByRole("button", { name: "Void invoice" })).toHaveCount(0);
  // reload persists
  await page.reload();
  expect(await page.locator("main").innerText()).toContain("₱1,509.90");
  // pdf
  const res = await page.request.get(invoiceUrl.replace("/invoices/", "/api/invoices/") + "/pdf");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  const buf = await res.body();
  expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  // double submit: two rapid clicks of the final amount
  await page.getByRole("button", { name: "Record payment" }).click();
  const d2 = page.getByRole("dialog");
  await d2.getByLabel("Amount received (₱)").fill("1509.90");
  const btn = d2.getByRole("button", { name: "Record payment" });
  await btn.dblclick();
  await expect(page.getByText("Paid in full")).toBeVisible({ timeout: 60_000 });
  await page.reload();
  body = await page.locator("main").innerText();
  console.log("AFTER FULL:", body.replace(/\n+/g, " | ").slice(-800));
  expect(body).toContain("₱2,010.15");
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Void invoice" })).toHaveCount(0);
  expect(await page.locator("li", { hasText: "Payment recorded" }).count()).toBe(2);
});

test("lists consistent, roles", async ({ page, browser }) => {
  watch(page);
  await login(page, QA_ACCOUNTS.owner);
  await page.goto("/invoices");
  await page.goto("/invoices?filter=paid");
  await expect(page.getByRole("link", { name: "View receipt" }).first()).toBeVisible();
  await page.goto("/invoices?filter=open&page=999");
  console.log("PAGE999:", (await page.locator("main").innerText()).match(/Showing[^\n]*/)?.[0]);
  const open = await (async () => { await page.goto("/invoices"); return tileCents(page, "Open"); })();
  await page.goto("/dashboard");
  expect(await tileCents(page, "Outstanding")).toBe(open);
  // doctor
  const ctx = await browser.newContext();
  const dp = await ctx.newPage();
  watch(dp);
  await login(dp, QA_ACCOUNTS.doctor);
  for (const u of ["/invoices", "/invoices/new", "/payments", invoiceUrl]) {
    await dp.goto(u);
    console.log("DOCTOR", u.slice(-20), dp.url().replace("http://localhost:3000", ""), (await dp.locator("main").innerText().catch(() => "")).slice(0, 60).replace(/\n/g, " "));
  }
  const r = await dp.request.get(invoiceUrl.replace("/invoices/", "/api/invoices/") + "/pdf");
  console.log("DOCTOR pdf", r.status());
  await ctx.close();
  // receptionist can record
  const ctx2 = await browser.newContext();
  const rp = await ctx2.newPage();
  watch(rp);
  await login(rp, QA_ACCOUNTS.receptionist);
  await rp.goto("/invoices");
  console.log("RECEP invoices ok", rp.url(), await rp.getByRole("heading", { name: "Invoices" }).count());
  await rp.goto("/payments");
  console.log("RECEP payments", rp.url());
  await rp.goto("/dashboard");
  console.log("RECEP dash money tiles", await rp.getByText("Outstanding", { exact: true }).count(), await rp.getByText("Collected today").count());
  await ctx2.close();
  console.log("BAD", JSON.stringify(bad));
});
