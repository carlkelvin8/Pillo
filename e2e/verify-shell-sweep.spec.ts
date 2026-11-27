import { expect, test, type Page } from "@playwright/test";
import { QA_PASSWORD, SKIP_REASON, signIn } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);

const VIEWPORTS = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1280, h: 800 },
];

const STATIC = [
  "/dashboard", "/appointments", "/dr-pill", "/dr-pill/activity", "/dr-pill/ask", "/integrations",
  "/invoices", "/invoices/new", "/patients", "/payments", "/settings", "/settings/branches",
  "/settings/clinic", "/settings/doctors", "/settings/dr-pill", "/settings/notifications",
  "/settings/staff", "/settings/subscription", "/onboarding", "/styleguide", "/styleguide/shell",
  "/does-not-exist", "/login", "/signup", "/forgot-password", "/reset-password", "/",
];

async function audit(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const de = document.documentElement;
    if (de.scrollWidth - de.clientWidth > 1) out.push(`overflow ${de.scrollWidth - de.clientWidth}px`);
    const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem]';
    const small = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest("[aria-hidden=true]") || el.closest("[inert]")) continue;
      if (el.classList.contains("sr-only") || /skip/i.test(el.textContent ?? "") && r.width < 2) continue;
      if (el.tagName === "INPUT" && /checkbox|radio/.test((el as HTMLInputElement).type)) {
        const l = el.closest("label"); if (l && l.getBoundingClientRect().height >= 44) continue;
      }
      if (r.height < 43.5) {
        const inline = el.tagName === "A" && cs.display === "inline" && el.closest("p,li,span");
        small.add(`${el.tagName.toLowerCase()}[${Math.round(r.width)}x${Math.round(r.height)}] "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"${inline ? " (inline link)" : ""}`);
      }
    }
    if (small.size) out.push("small: " + [...small].slice(0, 12).join(" | "));
    // clipped text
    const clipped: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("h1,h2,h3,button,a,p,span,label")) {
      const cs = getComputedStyle(el);
      if (cs.textOverflow === "ellipsis" || el.children.length) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || cs.display === "inline") continue;
      if ((cs.overflow !== "visible") && el.scrollWidth > el.clientWidth + 1) clipped.push((el.textContent ?? "").trim().slice(0, 30));
    }
    if (clipped.length) out.push("clipped: " + clipped.slice(0, 6).join(" | "));
    // heading order
    const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => (h as HTMLElement).offsetParent !== null).map((h) => +h.tagName[1]!);
    const h1s = hs.filter((x) => x === 1).length;
    if (h1s !== 1) out.push(`h1 count ${h1s}`);
    for (let i = 1; i < hs.length; i++) if (hs[i]! > hs[i - 1]! + 1) { out.push(`heading skip ${hs[i - 1]}->${hs[i]}`); break; }
    return out;
  });
}

test("responsive sweep", async ({ page }) => {
  test.setTimeout(1_800_000);
  const errors: string[] = [];
  let current = "";
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${current} console: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errors.push(`${current} pageerror: ${e.message.slice(0, 160)}`));
  page.on("requestfailed", (r) => { if (!/_rsc|aborted/i.test(r.failure()?.errorText ?? "") ) errors.push(`${current} reqfail ${r.url().slice(0, 100)} ${r.failure()?.errorText}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/does-not-exist/.test(current)) errors.push(`${current} HTTP ${r.status()} ${r.url().slice(0, 100)}`); });

  await signIn(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/patients"); await page.waitForLoadState("networkidle");
  const pHref = await page.locator('a[href^="/patients/"]').first().getAttribute("href");
  await page.goto("/invoices"); await page.waitForLoadState("networkidle");
  const iHref = await page.locator('a[href^="/invoices/"]:not([href="/invoices/new"])').first().getAttribute("href");
  const routes = [...STATIC, ...(pHref ? [pHref] : []), ...(iHref ? [iHref] : []), "/chat/does-not-exist", "/offer/badtoken", "/pay/mock/badref"];
  const rows: string[] = [];
  const only = process.env.SWEEP_ONLY?.split(",");
  for (const route of routes) {
    if (only && !only.some((o) => route === o || (o.endsWith("*") && route.startsWith(o.slice(0, -1))))) continue;
    for (const v of VIEWPORTS) {
      await page.setViewportSize({ width: v.w, height: v.h });
      current = `${route}@${v.w}`;
      try {
        await page.goto(route, { waitUntil: "load" });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(400);
        const issues = await audit(page);
        rows.push(`${current}: ${issues.length ? issues.join(" ;; ") : "ok"} (url ${new URL(page.url()).pathname})`);
      } catch (e) { rows.push(`${current}: NAV ERROR ${(e as Error).message.slice(0, 100)}`); }
    }
  }
  console.log("SWEEP\n" + rows.join("\n") + "\nERRORS\n" + [...new Set(errors)].join("\n"));
  expect(true).toBe(true);
});
