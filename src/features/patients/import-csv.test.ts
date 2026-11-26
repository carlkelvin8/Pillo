import { describe, expect, it } from "vitest";
import { parsePatientCsv, patientDedupKey } from "./import-csv";

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

describe("patientDedupKey", () => {
  it("matches names regardless of case and spacing", () => {
    expect(patientDedupKey("  Juan   Dela Cruz ", null)).toBe(patientDedupKey("juan dela cruz", ""));
  });
  it("matches local and +63 forms of the same mobile number", () => {
    const k = patientDedupKey("Ana", "09171234567");
    expect(patientDedupKey("Ana", "0917-123-4567")).toBe(k);
    expect(patientDedupKey("Ana", "+63 917 123 4567")).toBe(k);
    expect(patientDedupKey("Ana", "639171234567")).toBe(k);
  });
  it("keeps different people apart", () => {
    expect(patientDedupKey("Ana", "09171234567")).not.toBe(patientDedupKey("Ana", "09181234567"));
    expect(patientDedupKey("Ana Cruz", "09171234567")).not.toBe(patientDedupKey("Ana", "09171234567"));
  });
});
