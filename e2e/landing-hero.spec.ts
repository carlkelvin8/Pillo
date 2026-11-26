import { expect, test, type Page } from "@playwright/test";

/** The hero entrance animations run for under a second; measure only after the finite ones are done. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming();
      return t !== undefined && Number.isFinite(t.endTime);
    });
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
  });
}

test("keeps hero copy and signup visible on compact and landscape screens", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 667 },
    { width: 667, height: 375 },
    { width: 844, height: 390 },
    { width: 820, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await settle(page);

    const hero = page.locator("#hero");
    const header = await page.getByRole("banner").boundingBox();
    const chip = await hero.getByText("Made for clinics in the Philippines").boundingBox();
    const heading = await hero.getByRole("heading", { level: 1 }).boundingBox();
    const signup = await hero.getByRole("link", { name: "Create your clinic" }).boundingBox();

    expect(header).not.toBeNull();
    expect(chip).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(signup).not.toBeNull();
    expect(chip!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(heading!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    expect(heading!.y + heading!.height).toBeLessThan(viewport.height);
    expect(signup!.y + signup!.height).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("keeps the desktop hero CTA separate from its mascot", async ({ page }) => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await settle(page);

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
    expect(signup!.y + signup!.height).toBeLessThan(viewport.height);
    expect(signup!.x + signup!.width).toBeLessThan(mascot!.x);
  }
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
