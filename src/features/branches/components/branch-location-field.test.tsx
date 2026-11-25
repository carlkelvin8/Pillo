import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockMap({
      latitude,
      longitude,
    }: {
      latitude: number | null;
      longitude: number | null;
    }) {
      return (
        <div data-testid="map-coordinates">
          {latitude ?? "none"},{longitude ?? "none"}
        </div>
      );
    },
}));

import { BranchLocationField } from "./branch-location-field";

let testNow = Date.now();

describe("BranchLocationField address search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    testNow += 2000;
    vi.spyOn(Date, "now").mockReturnValue(testNow);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not show editable coordinate fields", () => {
    render(
      <form>
        <BranchLocationField latitude={null} longitude={null} />
        <button type="submit">Save branch</button>
      </form>,
    );

    expect(screen.queryByLabelText("Latitude")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Longitude")).not.toBeInTheDocument();
  });

  it("searches only after explicit submission and applies a selected result", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "14.5995", lon: "120.9842", display_name: "Manila, Philippines" }],
    } as Response);
    render(
      <form>
        <BranchLocationField latitude={null} longitude={null} />
        <button type="submit">Save branch</button>
      </form>,
    );

    fireEvent.change(screen.getByLabelText("Search address or place"), {
      target: { value: "Manila" },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Save branch" })).toHaveAttribute("type", "submit");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("button", { name: "Manila, Philippines" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/geocoding/search?"));
    expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manila, Philippines" }));

    expect(screen.getByTestId("map-coordinates")).toHaveTextContent("14.5995,120.9842");
    expect(document.querySelector('input[name="latitude"]')).toHaveValue("14.599500");
    expect(document.querySelector('input[name="longitude"]')).toHaveValue("120.984200");
  });

  it("does not send a request for a blank query", () => {
    render(<BranchLocationField latitude={null} longitude={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows an empty state when no places match", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<BranchLocationField latitude={null} longitude={null} />);
    fireEvent.change(screen.getByLabelText("Search address or place"), {
      target: { value: "No such clinic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("No places found. Try a nearby landmark or address."),
    ).toBeInTheDocument();
  });

  it("shows a recoverable error when search fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    render(<BranchLocationField latitude={null} longitude={null} />);
    fireEvent.change(screen.getByLabelText("Search address or place"), {
      target: { value: "Manila" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Search failed. Please try again.");
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });

  it("leaves request throttling to the server endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);
    render(<BranchLocationField latitude={null} longitude={null} />);
    fireEvent.change(screen.getByLabelText("Search address or place"), {
      target: { value: "Manila" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("starts a search on Enter without submitting the enclosing branch form", () => {
    render(
      <form>
        <BranchLocationField latitude={null} longitude={null} />
        <button type="submit">Save branch</button>
      </form>,
    );
    const searchInput = screen.getByLabelText("Search address or place");
    fireEvent.change(searchInput, { target: { value: "Manila" } });
    const enter = fireEvent.keyDown(searchInput, { key: "Enter" });

    expect(enter).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save branch" })).toHaveAttribute("type", "submit");
  });

  it("does not show results for an address that changed while the search was in flight", async () => {
    let resolveSearch!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );
    render(<BranchLocationField latitude={null} longitude={null} />);
    const input = screen.getByLabelText("Search address or place");
    fireEvent.change(input, { target: { value: "Manila" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(input, { target: { value: "Quezon City" } });

    await act(async () => {
      resolveSearch({
        ok: true,
        json: async () => [{ lat: "14.6", lon: "121.0", display_name: "Manila" }],
      } as Response);
    });

    expect(screen.queryByRole("button", { name: "Manila" })).not.toBeInTheDocument();
  });
});
