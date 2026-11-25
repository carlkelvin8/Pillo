import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppointmentsLineChart, CollectionsBarChart } from "./trend-charts";

const months = Array.from(
  { length: 12 },
  (_, index) => `2026-${String(index + 1).padStart(2, "0")}`,
);

describe("dashboard trend charts", () => {
  it("renders all collection months in an accessible bar chart and table", () => {
    render(<CollectionsBarChart months={months} values={[0, 0, 120_000, ...Array(9).fill(0)]} />);

    expect(screen.getByRole("img", { name: /collections by month/i })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Collections by month" });
    expect(within(table).getAllByRole("row")).toHaveLength(13);
    expect(table).toHaveTextContent("2026-01");
    expect(table).toHaveTextContent("₱0.00");
    expect(
      screen
        .getByRole("img", { name: /collections by month/i })
        .querySelector('[title^="2026-03"] > div'),
    ).toHaveClass("bg-mint-ink/80");
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

  it("compares completed months while keeping the current month visible", () => {
    render(
      <CollectionsBarChart months={months} values={[...Array(9).fill(0), 12_000, 18_500, 3_000]} />,
    );

    expect(screen.getByText("Nov vs Oct")).toBeInTheDocument();
    expect(screen.getByText("+₱65.00")).toBeInTheDocument();
    expect(screen.getByTitle("Dec (current month)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: "2026-12 ₱30.00" })).toBeInTheDocument();
  });

  it("shows empty states when neither series has recorded activity", () => {
    const values = months.map(() => 0);
    render(
      <>
        <AppointmentsLineChart months={months} values={values} />
        <CollectionsBarChart months={months} values={values} />
      </>,
    );

    expect(screen.getByText("No appointments in this period.")).toBeInTheDocument();
    expect(screen.getByText("No successful payments in this period.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /by month/ })).not.toBeInTheDocument();
  });

  it("gives zero collections no height within a populated series", () => {
    render(<CollectionsBarChart months={months} values={[0, 12_000]} />);

    expect(
      screen
        .getByRole("img", { name: /collections by month/i })
        .querySelector('[title^="2026-01"] > div'),
    ).toHaveStyle({ height: "0%" });
  });
});
