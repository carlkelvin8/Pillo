import { expect, test } from "@playwright/test";
import { QA_PASSWORD, SKIP_REASON, signIn } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);

/** Regression: the shell (sidebar rendered in the aside and in the drawer) must hydrate without errors. */
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
]) {
  test(`dashboard hydrates cleanly at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200));
    });
    await page.setViewportSize(viewport);
    await signIn(page);
    for (let i = 0; i < 4; i++) {
      await page.goto("/dashboard");
      await page.waitForLoadState("networkidle");
      await page.reload();
      await page.waitForLoadState("networkidle");
    }
    expect(errors).toEqual([]);
  });
}
