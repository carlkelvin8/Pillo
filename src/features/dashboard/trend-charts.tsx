import { Card, CardTitle } from "@/components/ui/card";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";

const MONTH = new Intl.DateTimeFormat("en-PH", { month: "short", timeZone: "UTC" });
const COUNT = new Intl.NumberFormat("en-PH");
const PHP_AXIS = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 2,
});
const AXIS_INTERVALS = 4;

function monthLabel(month: string) {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

function signedChange(value: number, format: (value: number) => string) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${format(Math.abs(value))}`;
}

function MonthlyTrend({
  months,
  values,
  title,
}: {
  months: string[];
  values: number[];
  title: "Appointments" | "Collections";
}) {
  const isCollections = title === "Collections";
  const format = isCollections ? formatPHP : COUNT.format;
  const data = months.map((month, index) => ({ month, value: values[index] ?? 0 }));
  const total = data.reduce((sum, month) => sum + month.value, 0);
  const end = data.length - 1;

  // The current calendar month is in progress. Compare the two most recent completed months.
  const latestComplete = data.at(-2);
  const previousComplete = data.at(-3);
  const difference = (latestComplete?.value ?? 0) - (previousComplete?.value ?? 0);

  const max = Math.max(1, ...data.map(({ value }) => value));
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(max / AXIS_INTERVALS)));
  const step = Math.ceil(max / AXIS_INTERVALS / magnitude) * magnitude;
  const ceiling = step * AXIS_INTERVALS;
  const ticks = Array.from({ length: AXIS_INTERVALS + 1 }, (_, i) => ceiling - i * step);
  const gridTemplateColumns = `repeat(${months.length}, minmax(0, 1fr))`;
  const points = data.map(({ value }, index) => {
    const x = (((index + 0.5) / months.length) * 1000).toFixed(2);
    const y = (100 - (value / ceiling) * 100).toFixed(2);
    return { x: Number(x), y: Number(y) };
  });
  const linePath = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");

  return (
    <Card className="@container flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <CardTitle>{title}</CardTitle>
        <span className="text-muted text-xs">Last {months.length} months</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="tabular text-3xl font-semibold tracking-tight">{format(total)}</p>
        {total > 0 && latestComplete && previousComplete ? (
          <p className="text-muted flex flex-wrap gap-x-1.5 text-sm">
            <span className={cn("tabular font-semibold", difference > 0 && "text-mint-ink")}>
              {signedChange(difference, format)}
            </span>
            <span>
              {monthLabel(latestComplete.month)} vs {monthLabel(previousComplete.month)}
            </span>
          </p>
        ) : null}
      </div>

      {total > 0 ? (
        <>
          <div
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2"
            role="img"
            aria-label={`${title} by month, ${format(total)} total`}
          >
            <div
              className="tabular text-muted flex flex-col justify-between text-right text-xs"
              aria-hidden="true"
            >
              {ticks.map((tick) => (
                <div key={tick} className="h-0">
                  <span className="block -translate-y-1/2">
                    {isCollections ? PHP_AXIS.format(tick / 100) : format(tick)}
                  </span>
                </div>
              ))}
            </div>
            <div className={cn("relative", isCollections ? "h-40" : "h-56")} aria-hidden="true">
              <div className="absolute inset-0 flex flex-col justify-between">
                {ticks.map((tick) => (
                  <div key={tick} className="bg-line h-px" />
                ))}
              </div>
              {isCollections ? null : (
                <svg
                  viewBox="0 0 1000 100"
                  className="absolute inset-0 h-full w-full overflow-visible"
                  preserveAspectRatio="none"
                >
                  <path
                    d={linePath}
                    fill="none"
                    stroke="var(--color-mint-ink)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns }}>
                {data.map(({ month, value }, index) => {
                  const previous = data[index - 1];
                  const comparison =
                    previous && index < end
                      ? ` · ${signedChange(value - previous.value, format)} vs ${monthLabel(previous.month)}`
                      : "";
                  const height = (value / ceiling) * 100;
                  return (
                    <div
                      key={month}
                      className="relative flex min-w-0 items-end justify-center"
                      title={`${month}: ${format(value)}${index === end ? " (current month)" : comparison}`}
                    >
                      {isCollections ? (
                        <div
                          className={cn(
                            "w-3/5 rounded-t-sm",
                            index === end ? "bg-mint-ink" : "bg-mint-ink/80",
                          )}
                          style={{ height: `${height}%` }}
                        />
                      ) : (
                        <div
                          className={cn(
                            "absolute size-2 translate-y-1/2 rounded-full",
                            index === end ? "bg-mint-ink" : "bg-surface",
                          )}
                          style={{ bottom: `${height}%` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              aria-hidden="true"
              className="text-muted col-start-2 grid text-center text-xs"
              style={{ gridTemplateColumns }}
            >
              {months.map((month, index) => {
                const isCurrent = index === end;
                const isSpacedTick = index % 2 === 0 && index < end - 1;
                const label = monthLabel(month);
                return (
                  <span
                    key={month}
                    title={isCurrent ? `${label} (current month)` : undefined}
                    className={cn(
                      isCurrent && "text-mint-ink font-semibold",
                      !isCurrent && !isSpacedTick && "invisible @sm:visible",
                    )}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
          <p className="text-muted text-xs">Current month in progress</p>
          <table className="sr-only">
            <caption>{title} by month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">{title}</th>
              </tr>
            </thead>
            <tbody>
              {data.map(({ month, value }) => (
                <tr key={month}>
                  <th scope="row">{month}</th>
                  <td>{format(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="border-line bg-canvas text-muted rounded-control flex h-36 items-center justify-center border px-4 text-center text-sm">
          {isCollections
            ? "No successful payments in this period."
            : "No appointments in this period."}
        </p>
      )}
    </Card>
  );
}

export function CollectionsBarChart({ months, values }: { months: string[]; values: number[] }) {
  return <MonthlyTrend months={months} values={values} title="Collections" />;
}

export function AppointmentsLineChart({ months, values }: { months: string[]; values: number[] }) {
  return <MonthlyTrend months={months} values={values} title="Appointments" />;
}
