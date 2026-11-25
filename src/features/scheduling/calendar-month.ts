import { addDays, isDateString, weekdayOf } from "@/lib/datetime";

export function monthBounds(anchor: string): { start: string; end: string } {
  if (!isDateString(anchor)) throw new RangeError(`Invalid date: ${anchor}`);
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7)) - 1;
  const start = `${anchor.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  return { start, end };
}

export function shiftMonth(anchor: string, amount: number): string {
  if (!isDateString(anchor) || !Number.isInteger(amount)) throw new RangeError("Invalid month shift");
  const date = new Date(Date.UTC(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)) - 1 + amount, 1));
  const targetMonth = date.toISOString().slice(0, 7);
  const day = Math.min(Number(anchor.slice(8, 10)), Number(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return `${targetMonth}-${String(day).padStart(2, "0")}`;
}

/** Monday-first month grid. Null cells pad the first week; dates stay clinic-local strings. */
export function monthCells(anchor: string): (string | null)[] {
  const { start, end } = monthBounds(anchor);
  const dayCount = Math.round(
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000,
  );
  const leading = (weekdayOf(start) + 6) % 7;
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => addDays(start, index)),
  ];
}
