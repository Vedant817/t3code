import type { TokenUsageDay, TokenUsageQueryResult } from "@t3tools/contracts";
import { BarChart3Icon, InfoIcon, RefreshCwIcon } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { useTokenUsage } from "../../hooks/useTokenUsage";
import {
  buildTokenUsageGrid,
  formatTokenCount,
  tokenUsageDateAfterKey,
  type TokenUsageDateRange,
  type TokenUsageGridCell,
} from "../../lib/tokenUsage";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
    new Date(`${date}T12:00:00`),
  );
}

function timestampLabel(timestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone }).format(
    new Date(timestamp),
  );
}

function cellLabel(cell: TokenUsageGridCell): string {
  if (cell.day === null) return `${dateLabel(cell.date)}: no recorded usage`;
  const total = cell.day.metrics.totalTokens;
  return `${dateLabel(cell.date)}: ${
    total === null ? "token total unknown" : `${total.toLocaleString()} tokens`
  }, ${cell.day.provenance}`;
}

function cellClass(cell: TokenUsageGridCell, selected: boolean): string {
  const total = cell.day?.metrics.totalTokens ?? null;
  return cn(
    "size-3.5 rounded-[3px] border transition-transform hover:scale-125 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    cell.day === null && "border-dashed border-border/70 bg-muted/20",
    cell.day !== null && total === null && "border-amber-500/50 bg-amber-500/25",
    cell.day !== null && total === 0 && "border-border bg-muted/60",
    total !== null &&
      total > 0 &&
      cell.intensity === 1 &&
      "border-emerald-500/30 bg-emerald-500/30",
    total !== null &&
      total > 0 &&
      cell.intensity === 2 &&
      "border-emerald-500/40 bg-emerald-500/50",
    total !== null &&
      total > 0 &&
      cell.intensity === 3 &&
      "border-emerald-500/50 bg-emerald-500/70",
    total !== null && total > 0 && cell.intensity === 4 && "border-emerald-500/60 bg-emerald-500",
    selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{formatTokenCount(value)}</div>
    </div>
  );
}

function SelectedDayDetails({ day, date }: { day: TokenUsageDay | null; date: string }) {
  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-background/60 p-4">
      <div>
        <h3 className="font-semibold">{dateLabel(date)}</h3>
        <p className="text-xs text-muted-foreground">
          {day === null
            ? "No provider accounting observation was recorded on this day."
            : `${day.provenance} provider accounting coverage`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric label="Total" value={day?.metrics.totalTokens ?? null} />
        <Metric label="Input" value={day?.metrics.inputTokens ?? null} />
        <Metric label="Cached" value={day?.metrics.cachedInputTokens ?? null} />
        <Metric label="Output" value={day?.metrics.outputTokens ?? null} />
        <Metric label="Reasoning" value={day?.metrics.reasoningOutputTokens ?? null} />
      </div>
      {day && day.breakdown.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="border-b border-border/70 text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Provider</th>
                <th className="px-2 py-2 font-medium">Model</th>
                <th className="px-2 py-2 font-medium">Reasoning</th>
                <th className="px-2 py-2 text-right font-medium">Input</th>
                <th className="px-2 py-2 text-right font-medium">Output</th>
                <th className="px-2 py-2 text-right font-medium">Reasoning tokens</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {day.breakdown.map((row) => (
                <tr
                  key={`${row.provider}:${row.model ?? "unknown"}:${row.reasoningLevel ?? "unknown"}`}
                  className="border-b border-border/40 last:border-0"
                >
                  <td className="px-2 py-2.5">{row.provider}</td>
                  <td className="px-2 py-2.5">
                    {row.model ?? "Unknown"}
                    {row.modelProvenance !== "exact" ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({row.modelProvenance})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5">
                    {row.reasoningLevel ?? "Unknown"}
                    {row.reasoningProvenance !== "exact" ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({row.reasoningProvenance})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatTokenCount(row.metrics.inputTokens)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatTokenCount(row.metrics.outputTokens)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatTokenCount(row.metrics.reasoningOutputTokens)}
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                    {formatTokenCount(row.metrics.totalTokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function UsageSettingsContent({
  data,
  error,
  isPending,
  refresh,
  range,
  timeZone,
}: {
  readonly data: TokenUsageQueryResult | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
  readonly range: TokenUsageDateRange;
  readonly timeZone: string;
}) {
  const [selectedDate, setSelectedDate] = useState(range.toDate);
  const initializedSelection = useRef(false);
  const days = data?.days ?? [];
  const daysByDate = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const weeks = useMemo(() => buildTokenUsageGrid(range.dates, days), [days, range.dates]);

  useEffect(() => {
    if (initializedSelection.current || data === null) return;
    initializedSelection.current = true;
    if (days.length > 0 && !daysByDate.has(range.toDate)) {
      setSelectedDate(days.at(-1)?.date ?? range.toDate);
    }
  }, [data, days, daysByDate, range.toDate]);

  const selectedDay = daysByDate.get(selectedDate) ?? null;
  const selectAndFocusDate = (date: string) => {
    initializedSelection.current = true;
    setSelectedDate(date);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-usage-date="${date}"]`)?.focus();
    });
  };
  const handleGridKeyDown = (event: KeyboardEvent, date: string) => {
    const nextDate = tokenUsageDateAfterKey(range.dates, date, event.key);
    if (!nextDate) return;
    event.preventDefault();
    selectAndFocusDate(nextDate);
  };

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Token Usage"
        icon={<BarChart3Icon className="size-5" />}
        headerAction={
          <Button size="sm" variant="outline" onClick={refresh} disabled={isPending}>
            <RefreshCwIcon className={cn("size-3.5", isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        <div className="space-y-5 rounded-xl px-3 py-3 sm:px-4">
          <div className="flex gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <p>
              Usage is recorded on this T3 environment from this version forward. Provider coverage
              varies, and unavailable values remain unknown. Days use <strong>{timeZone}</strong>.
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <p className="font-medium">Could not load token usage</p>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={refresh}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">Last 365 days</h3>
                    <p className="text-xs text-muted-foreground">
                      {data?.trackingStartedAt
                        ? `Tracking since ${timestampLabel(data.trackingStartedAt, timeZone)}`
                        : isPending
                          ? "Loading recorded usage…"
                          : "No usage has been recorded yet."}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span>Less</span>
                    {[0, 1, 2, 3, 4].map((level) => (
                      <span
                        key={level}
                        className={cn(
                          "size-3 rounded-[3px] border",
                          level === 0 && "border-border bg-muted/40",
                          level === 1 && "border-emerald-500/30 bg-emerald-500/30",
                          level === 2 && "border-emerald-500/40 bg-emerald-500/50",
                          level === 3 && "border-emerald-500/50 bg-emerald-500/70",
                          level === 4 && "border-emerald-500/60 bg-emerald-500",
                        )}
                      />
                    ))}
                    <span>More</span>
                  </div>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-max gap-1.5">
                    <div className="grid grid-rows-7 gap-1 pr-1 text-[9px] leading-[14px] text-muted-foreground">
                      {WEEKDAY_LABELS.map((label, index) => (
                        <span key={label}>{index % 2 === 1 ? label : ""}</span>
                      ))}
                    </div>
                    <div
                      className="grid grid-rows-7 gap-1"
                      role="grid"
                      aria-label="Daily token usage"
                      aria-rowcount={WEEKDAY_LABELS.length}
                      aria-colcount={weeks.length}
                    >
                      {WEEKDAY_LABELS.map((label, dayIndex) => (
                        <div key={label} className="flex gap-1" role="row">
                          {weeks.map((week, weekIndex) => {
                            const cell = week[dayIndex];
                            return cell ? (
                              <button
                                key={cell.date}
                                type="button"
                                role="gridcell"
                                aria-rowindex={dayIndex + 1}
                                aria-colindex={weekIndex + 1}
                                aria-label={cellLabel(cell)}
                                aria-selected={selectedDate === cell.date}
                                tabIndex={selectedDate === cell.date ? 0 : -1}
                                data-usage-date={cell.date}
                                title={cellLabel(cell)}
                                className={cellClass(cell, selectedDate === cell.date)}
                                onClick={() => selectAndFocusDate(cell.date)}
                                onKeyDown={(event) => handleGridKeyDown(event, cell.date)}
                              />
                            ) : (
                              <span
                                key={`empty-${week.find((candidate) => candidate)?.date}`}
                                className="size-3.5"
                                aria-hidden
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <SelectedDayDetails day={selectedDay} date={selectedDate} />
            </>
          )}
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function UsageSettingsPanel() {
  const state = useTokenUsage();
  return <UsageSettingsContent {...state} />;
}
