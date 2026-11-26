import { expect, test, type APIRequestContext } from "@playwright/test";
import { QA_ACCOUNTS, QA_PASSWORD, signInAs, SKIP_REASON } from "./helpers";

test.skip(!QA_PASSWORD, SKIP_REASON);
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const stamp = Date.now();
const patientName = `VERIFY Mcp ${stamp}`;
const HEAD = { accept: "application/json, text/event-stream", "content-type": "application/json" };

type McpJson = {
  result?: { isError?: boolean; content?: { text: string }[]; tools?: { name: string }[] };
} | null;

async function rpc(
  request: APIRequestContext,
  token: string | null,
  method: string,
  params?: unknown,
) {
  const res = await request.post("/api/mcp", {
    headers: { ...HEAD, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  const text = await res.text();
  const data = text.includes("data:")
    ? text
        .split("\n")
        .find((l) => l.startsWith("data:"))
        ?.slice(5)
    : text;
  let json: McpJson = null;
  try {
    json = JSON.parse(data ?? "");
  } catch {
    /* keep null */
  }
  return { status: res.status(), json, text };
}
const call = (r: APIRequestContext, t: string, name: string, args: unknown) =>
  rpc(r, t, "tools/call", { name, arguments: args });

let tokenAll = "";
let tokenRead = "";
let patientId = "";

test("create patient and tokens in the UI", async ({ page }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/patients");
  await page.getByRole("button", { name: "Add patient" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill(patientName);
  await dialog.getByLabel("Phone").fill("09171234567");
  await dialog.getByRole("button", { name: "Add patient" }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}/);
  patientId = page.url().split("/").pop()!;

  await page.goto("/integrations");
  // validation: empty name
  await page.getByRole("button", { name: "Create token" }).click();
  // name required (native) -> still no token
  await expect(page.getByLabel("New MCP bearer token")).toHaveCount(0);

  const make = async (name: string, scopes: string[], expiry: string) => {
    await page.getByLabel("Token name").fill(name);
    await page.getByLabel("Expires").selectOption(expiry);
    for (const s of scopes) await page.getByLabel(s, { exact: false }).first().check();
    await page.getByRole("button", { name: "Create token" }).click();
    const box = page.getByLabel("New MCP bearer token");
    await expect(box).toBeVisible();
    const t = await box.inputValue();
    await expect(page.getByText(name).first()).toBeVisible();
    return t;
  };
  tokenAll = await make(
    `VERIFY all ${stamp}`,
    [
      "Read appointments",
      "Search and read patient summaries",
      "Read daily clinic summaries",
      "Create draft invoices",
      "Request payment links",
    ],
    "30",
  );
  await page.reload();
  tokenRead = await make(`VERIFY read ${stamp}`, ["Read appointments"], "365");
  expect(tokenAll).not.toEqual(tokenRead);
  // token not shown after reload
  await page.reload();
  await expect(page.getByLabel("New MCP bearer token")).toHaveCount(0);
  await expect(page.getByText(`VERIFY all ${stamp}`)).toBeVisible();
  await expect(page.getByText("Not used yet").first()).toBeVisible();
});

test("endpoint auth and tools", async ({ request }) => {
  expect((await rpc(request, null, "tools/list")).status).toBe(401);
  expect((await rpc(request, "x".repeat(40), "tools/list")).status).toBe(401);
  expect((await rpc(request, "short", "tools/list")).status).toBe(401);

  const init = await rpc(request, tokenAll, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "verify", version: "1" },
  });
  console.log("init", init.status, init.text.slice(0, 200));
  const list = await rpc(request, tokenAll, "tools/list");
  expect(list.json?.result?.tools).toHaveLength(8);
  console.log(
    "tools",
    list.status,
    list.json?.result?.tools?.map((t) => t.name),
  );

  const today = new Date().toISOString().slice(0, 10);
  const la = await call(request, tokenAll, "list_appointments", { from: today, to: today });
  console.log("list_appointments", la.status, la.text.slice(0, 200));
  const bad = await call(request, tokenAll, "list_appointments", {
    from: "2020-01-01",
    to: "2021-01-01",
  });
  console.log("range", bad.text.slice(0, 250));
  const badArgs = await call(request, tokenAll, "list_appointments", { from: "nope" });
  console.log("badargs", badArgs.text.slice(0, 300));
  const unknown = await call(request, tokenAll, "drop_tables", {});
  console.log("unknown", unknown.text.slice(0, 200));

  // scope enforcement
  for (const [tool, args] of [
    ["find_patient", { query: "VERIFY" }],
    ["daily_summary", { from: today, to: today }],
    [
      "create_invoice",
      {
        patient_id: patientId,
        due_on: today,
        items: [{ description: "x", quantity: 1, unit_price_centavos: 100 }],
      },
    ],
    [
      "book_appointment",
      {
        patient_id: patientId,
        doctor_id: patientId,
        branch_id: patientId,
        starts_at: new Date().toISOString(),
        duration_minutes: 30,
      },
    ],
    ["request_payment", { invoice_id: patientId }],
  ] as const) {
    const r = await call(request, tokenRead, tool, args);
    console.log("scope", tool, r.json?.result?.isError, r.json?.result?.content?.[0]?.text);
    expect(r.json?.result?.isError).toBe(true);
  }

  const fp = await call(request, tokenAll, "find_patient", { query: "VERIFY Mcp" });
  console.log("find_patient", fp.text.slice(0, 300));
  const ds = await call(request, tokenAll, "daily_summary", { from: today, to: today });
  console.log("daily", ds.text.slice(0, 300));
  const inv = await call(request, tokenAll, "create_invoice", {
    patient_id: patientId,
    due_on: today,
    items: [{ description: "VERIFY item", quantity: 2, unit_price_centavos: 15000 }],
  });
  expect(inv.text).toContain("draft");
  const bogus = await call(request, tokenAll, "create_invoice", {
    patient_id: "00000000-0000-4000-8000-000000000000",
    due_on: today,
    items: [{ description: "VERIFY item", quantity: 1, unit_price_centavos: 100 }],
  });
  expect(bogus.json?.result?.isError).toBe(true);
  expect(bogus.text).not.toMatch(/Failed query|insert into|params:/i);
  const invId = JSON.parse(inv.json?.result?.content?.[0]?.text ?? "{}")?.id;
  const rp = await call(request, tokenAll, "request_payment", { invoice_id: invId ?? patientId });
  expect(rp.text).toContain("Online payment requests are not available yet.");
  const gp = await call(request, tokenAll, "get_patient_summary", { patient_id: patientId });
  console.log("summary(no scope?)", gp.text.slice(0, 200));
});

test("audit, activity and revoke", async ({ page, request }) => {
  await signInAs(page, QA_ACCOUNTS.owner);
  await page.goto("/integrations");
  const body = await page.locator("main").innerText();
  expect(body).toContain("Recent MCP activity");
  for (const name of [`VERIFY all ${stamp}`, `VERIFY read ${stamp}`]) {
    const row = page.locator("li", { hasText: name });
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(page.locator("li", { hasText: name }).getByText("Revoked")).toBeVisible();
  }
  expect((await rpc(request, tokenAll, "tools/list")).status).toBe(401);
  expect((await rpc(request, tokenRead, "tools/list")).status).toBe(401);
});
