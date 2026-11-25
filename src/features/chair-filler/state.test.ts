import { describe, expect, it } from "vitest";
import { offerState } from "./state";

const now = new Date("2027-01-14T00:00:00Z");
const o = (over = {}) => ({
  status: "sent" as const,
  starts_at: "2027-01-14T06:00:00Z",
  expires_at: "2027-01-14T03:00:00Z",
  ...over,
});

describe("offerState", () => {
  it("is open when approved, unexpired and in the future", () =>
    expect(offerState(o(), now)).toBe("open"));
  it("is closed until staff approve", () =>
    expect(offerState(o({ status: "proposed" }), now)).toBe("closed"));
  it("is closed when skipped, declined or expired by status", () => {
    for (const status of ["skipped", "declined", "expired"] as const)
      expect(offerState(o({ status }), now)).toBe("closed");
  });
  it("reports accepted", () => expect(offerState(o({ status: "accepted" }), now)).toBe("accepted"));
  it("expires at the expiry time", () =>
    expect(offerState(o(), new Date("2027-01-14T03:00:00Z"))).toBe("expired"));
  it("expires once the slot has started", () =>
    expect(offerState(o({ expires_at: null }), new Date("2027-01-14T06:00:00Z"))).toBe("expired"));
});
