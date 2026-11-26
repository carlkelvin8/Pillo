import { expect, test } from "@playwright/test";

test("keeps the hero headline and signup action in compact mobile viewports", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const hero = page.locator("#hero");
    const header = await page.getByRole("banner").boundingBox();
    const heading = await hero.getByRole("heading", { level: 1 }).boundingBox();
    const signup = await hero.getByRole("link", { name: "Create your clinic" }).boundingBox();

    expect(header).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(signup).not.toBeNull();
    expect(heading!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(heading!.y + heading!.height).toBeLessThan(viewport.height);
    expect(signup!.y + signup!.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("keeps the desktop hero CTA separate from its mascot", async ({ page }) => {
  const viewport = { width: 1440, height: 900 };
  await page.setViewportSize(viewport);
  await page.goto("/");

  const hero = page.locator("#hero");
  const header = await page.getByRole("banner").boundingBox();
  const heading = await hero.getByRole("heading", { level: 1 }).boundingBox();
  const signup = await hero.getByRole("link", { name: "Create your clinic" }).boundingBox();
  const mascot = await hero.locator("[data-mascot-anchor]").boundingBox();

  expect(header).not.toBeNull();
  expect(heading).not.toBeNull();
  expect(signup).not.toBeNull();
  expect(mascot).not.toBeNull();
  expect(heading!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(signup!.x + signup!.width).toBeLessThan(mascot!.x);
});

test("keeps hero content visible with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const hero = page.locator("#hero");
  await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(hero.getByRole("link", { name: "Create your clinic" })).toBeVisible();
  await expect(page.locator(".story-hero-content")).toHaveCSS("opacity", "1");
});

test("keeps hero content visible without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 667 },
  });
  const page = await context.newPage();

  try {
    await page.goto("/");
    const hero = page.locator("#hero");
    await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(hero.getByRole("link", { name: "Create your clinic" })).toBeVisible();
    await expect(page.locator(".story-hero-content")).toHaveCSS("opacity", "1");
  } finally {
    await context.close();
  }
});
