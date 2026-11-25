import { describe, expect, it } from "vitest";
import { parsePatientCsv } from "./import-csv";

describe("parsePatientCsv", () => {
  it("supports quoted commas and imports only valid rows without consent", () => {
    const result = parsePatientCsv('full_name,phone,email,birthdate,sex\n"Santos, Ana",0917,,1990-01-02,female\n,0918,,,male');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ full_name: "Santos, Ana", consent_at: null });
    expect(result.errors).toEqual([{ row: 3, message: "Enter the patient's name." }]);
  });
  it("requires the expected header order", () => {
    expect(() => parsePatientCsv("name,phone\nA,1")).toThrow("Use these columns");
  });
});
