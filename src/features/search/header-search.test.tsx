import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderSearch } from "./header-search";
import type { SearchResult } from "./schema";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const result: SearchResult = {
  group: "invoices",
  id: "00000000-0000-0000-0000-000000000001",
  title: "INV-0001",
  subtitle: "",
  href: "/invoices/00000000-0000-0000-0000-000000000001",
};

describe("HeaderSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [result] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps results when an edit leaves the trimmed query unchanged", async () => {
    render(<HeaderSearch />);
    const input = screen.getByRole("combobox", { name: "Search patients and invoices" });

    fireEvent.change(input, { target: { value: "INV" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole("option", { name: /INV-0001/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "INV " } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(input).toHaveValue("INV ");
    expect(screen.getByRole("option", { name: /INV-0001/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 result");
    expect(screen.getByRole("status")).not.toHaveTextContent("Searching");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
