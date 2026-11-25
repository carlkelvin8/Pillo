import { describe, expect, it } from "vitest";
import { APP_NAME, APP_PAY_LABEL } from "./brand";

describe("brand", () => {
  it("derives the pay label from APP_NAME", () => {
    expect(APP_PAY_LABEL).toBe(`${APP_NAME} Pay`);
  });
});
