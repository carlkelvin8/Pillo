import { describe, expect, it } from "vitest";
import { clinicLogoUrl, sniffImageType } from "./logo";

describe("clinic logo helpers", () => {
  it("recognises png, jpeg and webp by content", () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    expect(sniffImageType(new Uint8Array(webp))).toBe("image/webp");
  });
  it("rejects svg, html and empty files", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns='x'></svg>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
  it("returns null without a path", () => {
    expect(clinicLogoUrl(null)).toBeNull();
  });
});
