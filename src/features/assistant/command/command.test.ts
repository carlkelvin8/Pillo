import { describe, expect, it, vi } from "vitest";
import type { ModelRequest, ModelResponse } from "@/features/assistant/agent/model";
import { executeMetricTool, type MetricsSource } from "./metrics";
import { askOwner } from "./run";

const source = (over: Partial<MetricsSource> = {}): MetricsSource => ({
  payments: async () => [
    { method: "gcash", centavos: 150_000, paidAt: "2027-01-05T02:00:00Z" },
    { method: "cash", centavos: 50_000, paidAt: "2027-01-06T02:00:00Z" },
  ],
  appointmentStatuses: async () => ["completed", "completed", "completed", "no_show", "cancelled"],
  invoices: async () => ({
    open: { centavos: 1, count: 1 },
    overdue: { centavos: 0, count: 0 },
    paidThisMonth: { centavos: 0, count: 0 },
  }),
  chairFiller: async () => ({
    filled: 2,
    kept: 1,
    avgVisitCentavos: 150_000,
    recoveredCentavos: 150_000,
  }),
  ...over,
});
const ctx = (s = source()) => ({ source: s, tz: "Asia/Manila" });

describe("executeMetricTool", () => {
  it("totals revenue with formatted pesos and groups by method and day", async () => {
    const r = await executeMetricTool(
      "get_revenue",
      { from: "2027-01-01", to: "2027-01-31" },
      ctx(),
    );
    const d = JSON.parse(r.content);
    expect(d.total).toEqual({ centavos: 200_000, pesos: "₱2,000.00" });
    expect(d.paymentCount).toBe(2);
    expect(d.byMethod.gcash.centavos).toBe(150_000);
    expect(Object.keys(d.byDay)).toEqual(["2027-01-05", "2027-01-06"]);
  });
  it("groups long ranges by month", async () => {
    const d = JSON.parse(
      (await executeMetricTool("get_revenue", { from: "2027-01-01", to: "2027-06-30" }, ctx()))
        .content,
    );
    expect(Object.keys(d.byMonth)).toEqual(["2027-01"]);
  });
  it("computes the no-show rate as no_show / (completed + no_show)", async () => {
    const d = JSON.parse(
      (
        await executeMetricTool(
          "get_appointment_stats",
          { from: "2027-01-01", to: "2027-01-31" },
          ctx(),
        )
      ).content,
    );
    expect(d.noShowRate).toBe(25);
    expect(d.byStatus.cancelled).toBe(1);
  });
  it("returns null, not zero, when there is nothing to base a rate on", async () => {
    const s = source({ appointmentStatuses: async () => ["scheduled"] });
    const d = JSON.parse(
      (
        await executeMetricTool(
          "get_appointment_stats",
          { from: "2027-01-01", to: "2027-01-31" },
          ctx(s),
        )
      ).content,
    );
    expect(d.noShowRate).toBeNull();
  });
  it("rejects bad ranges as tool errors without touching data", async () => {
    const payments = vi.fn(async () => []);
    const c = ctx(source({ payments }));
    for (const input of [
      { from: "2027-02-01", to: "2027-01-01" },
      { from: "2020-01-01", to: "2027-01-01" },
      { from: "yesterday", to: "today" },
      {},
    ]) {
      expect((await executeMetricTool("get_revenue", input, c)).isError).toBe(true);
    }
    expect(payments).not.toHaveBeenCalled();
  });
  it("labels the recovered figure as an estimate and hides it when unset", async () => {
    const d = JSON.parse((await executeMetricTool("get_chair_filler_summary", {}, ctx())).content);
    expect(d.estimatedRecovered.pesos).toBe("₱1,500.00");
    expect(d.note).toMatch(/Estimate/);
    const n = JSON.parse(
      (
        await executeMetricTool(
          "get_chair_filler_summary",
          {},
          ctx(
            source({
              chairFiller: async () => ({
                filled: 0,
                kept: 0,
                avgVisitCentavos: null,
                recoveredCentavos: null,
              }),
            }),
          ),
        )
      ).content,
    );
    expect(n.estimatedRecovered).toBeNull();
  });
  it("turns data failures and unknown tools into errors without leaking details", async () => {
    const r = await executeMetricTool(
      "get_revenue",
      { from: "2027-01-01", to: "2027-01-31" },
      ctx(
        source({
          payments: async () => {
            throw new Error("secret db detail");
          },
        }),
      ),
    );
    expect(r.isError).toBe(true);
    expect(r.content).not.toContain("secret");
    expect((await executeMetricTool("drop_tables", {}, ctx())).isError).toBe(true);
  });
});

type TestBlock =
  { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
const msg = (content: TestBlock[], stop: "tool_use" | "end_turn" | "refusal"): ModelResponse => ({
  text: content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n"),
  toolCalls: content
    .filter((block): block is Extract<TestBlock, { type: "tool_use" }> => block.type === "tool_use")
    .map(({ id, name, input }) => ({ id, name, input })),
  stopReason: stop === "end_turn" ? "end" : stop,
});
describe("askOwner", () => {
  const base = {
    model: "m",
    question: "Why is revenue down?",
    clinicName: "Sample",
    tz: "Asia/Manila",
    now: new Date("2027-01-14T00:00:00Z"),
  };
  it("runs a tool, returns its result to the model, then answers", async () => {
    const seen: ModelRequest[] = [];
    const replies = [
      msg(
        [
          {
            type: "tool_use",
            id: "t1",
            name: "get_revenue",
            input: { from: "2027-01-01", to: "2027-01-31" },
          },
        ],
        "tool_use",
      ),
      msg([{ type: "text", text: "You collected ₱2,000.00." }], "end_turn"),
    ];
    const call = async (p: ModelRequest) => (seen.push(structuredClone(p)), replies.shift()!);
    const r = await askOwner({ ...base, source: source(), call });
    expect(r).toEqual({ reply: "You collected ₱2,000.00.", steps: 2 });
    const toolResult = seen[1]!.messages.at(-1)!;
    expect(toolResult.role).toBe("tool");
    if (toolResult.role !== "tool") throw new Error("expected tool results");
    expect(toolResult.toolResults[0]!.callId).toBe("t1");
    expect(toolResult.toolResults[0]!.content).toContain("₱2,000.00");
    expect(seen[0]!.tools.map((t) => t.name).sort()).toEqual([
      "get_appointment_stats",
      "get_chair_filler_summary",
      "get_invoice_overview",
      "get_revenue",
    ]);
    expect(seen[0]!.system).toContain("ONLY with numbers from your tools");
  });
  it("gives a safe fallback if the model keeps calling tools", async () => {
    const call = async () =>
      msg(
        [
          {
            type: "tool_use",
            id: "t",
            name: "get_invoice_overview",
            input: {},
          },
        ],
        "tool_use",
      );
    const r = await askOwner({ ...base, source: source(), call });
    expect(r.steps).toBe(6);
    expect(r.reply).toMatch(/couldn't get those numbers/);
  });
});
