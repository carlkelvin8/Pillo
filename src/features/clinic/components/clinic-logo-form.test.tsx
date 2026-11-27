import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/clinic/actions", () => ({
  uploadClinicLogoAction: vi.fn(async () => ({})),
  removeClinicLogoAction: vi.fn(async () => ({})),
}));

import { uploadClinicLogoAction } from "@/features/clinic/actions";
import { ClinicLogoForm } from "./clinic-logo-form";

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

describe("ClinicLogoForm preview URLs", () => {
  let n = 0;
  const create = vi.fn(() => `blob:preview-${++n}`);
  const revoke = vi.fn();

  beforeEach(() => {
    n = 0;
    create.mockClear();
    revoke.mockClear();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  });
  afterEach(() => vi.restoreAllMocks());

  it("revokes the previous blob URL when the file changes and on unmount", () => {
    const { container, unmount } = render(<ClinicLogoForm clinicName="Clinic" logoUrl={null} />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;

    fireEvent.change(input, { target: { files: [png("a.png")] } });
    expect(revoke).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [png("b.png")] } });
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");

    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:preview-2");
  });

  it("drops the preview after a rejected upload so Upload cannot be sent with no file", async () => {
    vi.mocked(uploadClinicLogoAction).mockResolvedValueOnce({ message: "Use a PNG, JPG or WebP image." });
    const { container } = render(<ClinicLogoForm clinicName="Clinic" logoUrl={null} />);
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    fireEvent.change(input, { target: { files: [png("a.png")] } });
    const upload = screen.getByRole("button", { name: /upload logo/i });
    expect(upload).toBeEnabled();
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
    });
    expect(await screen.findByText("Use a PNG, JPG or WebP image.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /upload logo/i })).toBeDisabled();
  });
});
