import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@/config/brand";
import GlobalError from "./global-error";

afterEach(() => vi.restoreAllMocks());

describe("GlobalError", () => {
  it("shows a branded message, retries, and logs only the digest", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const error = Object.assign(new Error("secret patient detail"), { digest: "abc123" });

    render(<GlobalError error={error} reset={reset} />, { container: document });

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(APP_NAME, { exact: true })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("secret patient detail");

    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveClass("min-h-11");
    fireEvent.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);

    expect(log).toHaveBeenCalledWith("Unhandled root error", "abc123");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret patient detail");
  });
});
