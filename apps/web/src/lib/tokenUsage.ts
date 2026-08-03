import type { TokenUsageCalendarDate, TokenUsageDay } from "@t3tools/contracts";

export interface TokenUsageDateRange {
  readonly fromDate: TokenUsageCalendarDate;
  readonly toDate: TokenUsageCalendarDate;
  readonly dates: ReadonlyArray<TokenUsageCalendarDate>;
}

export interface TokenUsageGridCell {
  readonly date: TokenUsageCalendarDate;
  readonly day: TokenUsageDay | null;
  readonly intensity: 0 | 1 | 2 | 3 | 4;
}

export function formatLocalCalendarDate(date: Date): TokenUsageCalendarDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function trailingTokenUsageRange(today = new Date(), count = 365): TokenUsageDateRange {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dates: TokenUsageCalendarDate[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - offset);
    dates.push(formatLocalCalendarDate(date));
  }
  return {
    fromDate: dates[0]!,
    toDate: dates.at(-1)!,
    dates,
  };
}

function totalFor(day: TokenUsageDay | null): number | null {
  return day?.metrics.totalTokens ?? null;
}

export function tokenUsageIntensity(total: number | null, maximum: number): 0 | 1 | 2 | 3 | 4 {
  if (total === null || total <= 0 || maximum <= 0) return 0;
  const ratio = Math.log1p(total) / Math.log1p(maximum);
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function buildTokenUsageGrid(
  dates: ReadonlyArray<TokenUsageCalendarDate>,
  days: ReadonlyArray<TokenUsageDay>,
): ReadonlyArray<ReadonlyArray<TokenUsageGridCell | null>> {
  if (dates.length === 0) return [];
  const byDate = new Map(days.map((day) => [day.date, day]));
  const maximum = Math.max(0, ...days.map((day) => day.metrics.totalTokens ?? 0));
  const cells: Array<TokenUsageGridCell | null> = [];
  const firstDate = new Date(`${dates[0]}T12:00:00`);
  for (let padding = 0; padding < firstDate.getDay(); padding += 1) {
    cells.push(null);
  }
  for (const date of dates) {
    const day = byDate.get(date) ?? null;
    const total = totalFor(day);
    cells.push({ date, day, intensity: tokenUsageIntensity(total, maximum) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<ReadonlyArray<TokenUsageGridCell | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export function tokenUsageDateAfterKey(
  dates: ReadonlyArray<TokenUsageCalendarDate>,
  currentDate: string,
  key: string,
): TokenUsageCalendarDate | null {
  const index = dates.indexOf(currentDate);
  if (index < 0) return null;
  const offset =
    key === "ArrowUp"
      ? -1
      : key === "ArrowDown"
        ? 1
        : key === "ArrowLeft"
          ? -7
          : key === "ArrowRight"
            ? 7
            : key === "Home"
              ? -index
              : key === "End"
                ? dates.length - index - 1
                : null;
  return offset === null ? null : (dates[index + offset] ?? null);
}

export function formatTokenCount(value: number | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
