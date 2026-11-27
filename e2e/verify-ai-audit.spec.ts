import { expect, test } from "@playwright/test";
import { QA_ACCOUNTS, QA_PASSWORD, signInAs, SKIP_REASON } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.setTimeout(300_000);

test("every MCP call is audited and visible in the activity list", async ({ page, request }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/integrations");
  const name = `VERIFY audit ${Date.now()}`;
  await page.getByLabel("Token name").fill(name);
  await page.getByLabel("Read appointments").check();
  await page.getByRole("button", { name: "Create token" }).click();
  const token = await page.getByLabel("New MCP bearer token").inputValue();
  const today = new Date().toISOString().slice(0, 10);
  const res = await request.post("/api/mcp", {
    headers: { accept: "application/json, text/event-stream", "content-type": "application/json", authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_appointments", arguments: { from: today, to: today } } },
  });
  expect(res.status()).toBe(200);
  await page.reload();
  await expect(page.getByText("list_appointments").first()).toBeVisible();
  const row = page.locator("li", { hasText: name });
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(page.locator("li", { hasText: name }).getByText("Revoked")).toBeVisible();
});
