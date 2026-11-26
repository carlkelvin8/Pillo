import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/chair-filler/actions", () => ({
  skipOfferAction: vi.fn(async () => ({})),
  approveOfferAction: vi.fn(async () => ({
    ok: true,
    message: "Approved.",
    data: {
      text: "Hi po! Slot available: https://x.test/offer/abc",
      link: "https://x.test/offer/abc",
    },
  })),
}));

import { OfferActions } from "./offer-card";

async function approve() {
  render(<OfferActions offerId="11111111-1111-4111-8111-111111111111" sent={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Approve and get message" }));
  return screen.findByRole("button", { name: "Copy message" });
}

afterEach(() => vi.restoreAllMocks());

describe("OfferActions copy button", () => {
  it("copies the generated message with the clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const copy = await approve();
    expect(copy.className).toContain("min-h-11");
    fireEvent.click(copy);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("Hi po! Slot available: https://x.test/offer/abc"),
    );
    expect(await screen.findByText("Copied.")).toBeInTheDocument();
  });

  it("falls back to selecting the text when the clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const copy = await approve();
    fireEvent.click(copy);
    expect(await screen.findByText(/Selected\. Press Ctrl\+C/)).toBeInTheDocument();
    const area = screen.getByLabelText(/Message to send/) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(area);
  });
});
