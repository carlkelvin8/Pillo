import { describe, expect, it } from "vitest";
import { summarizeOpen } from "./queries";

describe("summarizeOpen", () => {
  it("counts only what is still owed on partly paid invoices", () => {
    const invoices = [
      { id: "a", total_centavos: 100000, due_on: "2026-01-01" },
      { id: "b", total_centavos: 50000, due_on: "2026-12-31" },
      { id: "c", total_centavos: 20000, due_on: "2026-01-01" },
    ];
    const paid = new Map([
      ["a", 40000],
      ["c", 20000],
    ]);
    expect(summarizeOpen(invoices, paid, "2026-06-01")).toEqual({
      open: { centavos: 110000, count: 2 },
      overdue: { centavos: 60000, count: 1 },
    });
  });
});
