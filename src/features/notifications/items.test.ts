import { describe, expect, it } from "vitest";
import { buildNotificationItems, totalCount } from "./items";

const all = { needsHuman: 2, proposedOffers: 1, overdueInvoices: 3, unconfirmedToday: 4 };

describe("buildNotificationItems", () => {
  it("shows every alert to an owner and totals the counts", () => {
    const items = buildNotificationItems("owner", all);
    expect(items.map((i) => i.id)).toEqual([
      "needsHuman",
      "proposedOffers",
      "overdueInvoices",
      "unconfirmedToday",
    ]);
    expect(totalCount(items)).toBe(10);
  });
  it("hides zero counts", () => {
    expect(
      buildNotificationItems("owner", { ...all, needsHuman: 0, overdueInvoices: 0 }),
    ).toHaveLength(2);
    expect(
      buildNotificationItems("owner", {
        needsHuman: 0,
        proposedOffers: 0,
        overdueInvoices: 0,
        unconfirmedToday: 0,
      }),
    ).toEqual([]);
  });
  it("respects role capabilities", () => {
    const doctor = buildNotificationItems("doctor", all).map((i) => i.id);
    expect(doctor).toEqual(["unconfirmedToday"]);
    const billing = buildNotificationItems("billing", all).map((i) => i.id);
    expect(billing).toEqual(["overdueInvoices", "unconfirmedToday"]);
  });
  it("links only to in-app routes and singularises", () => {
    const [first] = buildNotificationItems("owner", { ...all, needsHuman: 1 });
    expect(first?.href.startsWith("/")).toBe(true);
    expect(first?.detail).toBe("1 conversation needs a reply.");
  });
});
