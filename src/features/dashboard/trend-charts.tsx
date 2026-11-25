import { Card, CardTitle } from "@/components/ui/card";
import { formatPHP } from "@/lib/money";

const MONTH = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });

function monthLabel(month: string) {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

function priorMonthLabel(months: string[]) {
  const month = months.at(-2);
  return month ? monthLabel(month) : "prior month";
}

export function CollectionsBarChart({
  months,
  values,
  total,
}: {
  months: string[];
  values: number[];
  total: number;
}) {
  const maxValue = Math.max(1, ...values);
  const current = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const difference = current - previous;
  const change =
    difference === 0
      ? "No change vs prior month"
      : `${difference > 0 ? "+" : "−"}${formatPHP(Math.abs(difference))} vs ${priorMonthLabel(months)}`;

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>Collections</CardTitle>
        <span className="tabular text-muted text-sm">Last 12 months</span>
      </div>
      <p className="tabular text-3xl font-semibold tracking-tight">{formatPHP(total)}</p>
      <p className={difference > 0 ? "text-mint-ink text-sm font-medium" : "text-muted text-sm"}>
        {change}
      </p>
      <div
        className="flex h-36 items-end gap-2"
        role="img"
        aria-label={`Collections by month, total ${formatPHP(total)}`}
      >
        {months.map((month, index) => {
          const value = values[index] ?? 0;
          return (
            <div
              key={month}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              aria-hidden="true"
              title={`${month}: ${formatPHP(value)}`}
            >
              <div
                className={`w-full rounded-t-[4px] ${value > 0 ? "bg-mint-ink" : "bg-subtle"}`}
                style={{ height: `${Math.max(4, (value / maxValue) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="text-muted flex justify-between text-xs" aria-hidden="true">
        <span>{months[0] ? monthLabel(months[0]) : ""}</span>
        <span>{months.at(-1) ? monthLabel(months.at(-1)!) : ""}</span>
      </div>
      <table className="sr-only">
        <caption>Collections by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Collections</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month, index) => (
            <tr key={month}>
              <th scope="row">{month}</th>
              <td>{formatPHP(values[index] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function AppointmentsLineChart({ months, values }: { months: string[]; values: number[] }) {
  const maxValue = Math.max(1, ...values);
  const current = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const difference = current - previous;
  const change =
    difference === 0
      ? "No change vs prior month"
      : `${difference > 0 ? "+" : "−"}${Math.abs(difference)} vs ${priorMonthLabel(months)}`;
  const width = 600;
  const height = 144;
  const xPadding = 16;
  const yPadding = 14;
  const points = values.map((value, index) => {
    const x =
      months.length < 2
        ? width / 2
        : xPadding + (index / (months.length - 1)) * (width - xPadding * 2);
    const y = height - yPadding - (value / maxValue) * (height - yPadding * 2);
    return { x, y, value, month: months[index] ?? "" };
  });
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>Appointments</CardTitle>
        <span className="text-muted text-sm">Last 12 months</span>
      </div>
      <p className="tabular text-3xl font-semibold tracking-tight">
        {values.reduce((sum, value) => sum + value, 0)}
      </p>
      <p className={difference > 0 ? "text-mint-ink text-sm font-medium" : "text-muted text-sm"}>
        {change}
      </p>
      <div
        className="min-w-0"
        role="img"
        aria-label={`Appointments by month, ${values.reduce((sum, value) => sum + value, 0)} total`}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-36 w-full overflow-visible"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[0, 0.5, 1].map((fraction) => {
            const y = yPadding + fraction * (height - yPadding * 2);
            return (
              <line
                key={fraction}
                x1={0}
                x2={width}
                y1={y}
                y2={y}
                stroke="var(--color-line)"
                strokeDasharray={fraction === 1 ? undefined : "3 6"}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {points.length > 0 ? (
            <>
              <polyline
                points={linePoints}
                fill="none"
                stroke="var(--color-mint-ink)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point) => (
                <circle
                  key={point.month}
                  cx={point.x}
                  cy={point.y}
                  r={4}
                  fill="var(--color-surface)"
                  stroke="var(--color-mint-ink)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </>
          ) : null}
        </svg>
      </div>
      <div className="text-muted flex justify-between text-xs" aria-hidden="true">
        <span>{months[0] ? monthLabel(months[0]) : ""}</span>
        <span>{months.at(-1) ? monthLabel(months.at(-1)!) : ""}</span>
      </div>
      <table className="sr-only">
        <caption>Appointments by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Appointments</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month, index) => (
            <tr key={month}>
              <th scope="row">{month}</th>
              <td>{values[index] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
