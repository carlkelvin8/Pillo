import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppointmentsLineChart, CollectionsBarChart } from "./trend-charts";

const months = Array.from(
  { length: 12 },
  (_, index) => `2026-${String(index + 1).padStart(2, "0")}`,
);

describe("dashboard trend charts", () => {
  it("renders all collection months in an accessible bar chart and table", () => {
    render(
      <CollectionsBarChart
        months={months}
        values={[0, 0, 120_000, ...Array(9).fill(0)]}
        total={120_000}
      />,
    );

    expect(screen.getByRole("img", { name: /collections by month/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Collections by month" });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(table).toHaveTextContent("2026-01");
    expect(table).toHaveTextContent("₱0.00");
    expect(
      screen
        .getByRole("img", { name: /collections by month/i })
        .querySelector('[title^="2026-03"] > div'),
    ).toHaveClass("bg-mint-ink");
  });

  it("renders all appointment months, including zero-value months", () => {
    render(<AppointmentsLineChart months={months} values={[0, 2, ...Array(10).fill(0)]} />);

    expect(screen.getByRole("img", { name: /appointments by month/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Appointments by month" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(13);
    const january = within(table).getByRole("row", { name: "2026-01 0" });
    const february = within(table).getByRole("row", { name: "2026-02 2" });
    expect(within(january).getByRole("rowheader")).toHaveTextContent("2026-01");
    expect(within(january).getByRole("cell")).toHaveTextContent("0");
    expect(within(february).getByRole("rowheader")).toHaveTextContent("2026-02");
    expect(within(february).getByRole("cell")).toHaveTextContent("2");
  });
});
