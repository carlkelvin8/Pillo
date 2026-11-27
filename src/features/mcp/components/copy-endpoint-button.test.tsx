import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyEndpointButton } from "./copy-endpoint-button";

const endpoint = "https://clinic.example/api/mcp";
const setClipboard = (value: unknown) =>
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });

afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
});

describe("CopyEndpointButton", () => {
  it("copies the endpoint with the clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<CopyEndpointButton endpoint={endpoint} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(endpoint);
    expect(screen.getByRole("status")).toHaveTextContent("Copied.");
  });

  it.each([
    ["navigator.clipboard is undefined", undefined],
    ["writeText is refused", { writeText: vi.fn().mockRejectedValue(new Error("denied")) }],
  ])("selects the URL when %s", async (_label, clipboard) => {
    setClipboard(clipboard);
    render(<CopyEndpointButton endpoint={endpoint} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(await screen.findByText("Selected. Press Ctrl+C to copy.")).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe(endpoint);
  });
});
