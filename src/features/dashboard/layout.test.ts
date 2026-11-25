import { describe, expect, it } from "vitest";
import { dashboardAnalyticsLayout } from "./layout";

describe("dashboardAnalyticsLayout", () => {
  it("pairs clinic balance and collections in the top analytics row", () => {
    expect(dashboardAnalyticsLayout()).toEqual({
      columns: "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
    });
  });
});
