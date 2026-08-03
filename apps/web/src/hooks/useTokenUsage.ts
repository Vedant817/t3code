import { useCallback, useEffect, useMemo, useState } from "react";

import { serverEnvironment } from "../state/server";
import { usePrimaryEnvironment } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { trailingTokenUsageRange } from "../lib/tokenUsage";

export function useTokenUsage() {
  const environmentId = usePrimaryEnvironment()?.environmentId ?? null;
  const [calendarRevision, setCalendarRevision] = useState(0);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [calendarRevision],
  );
  const range = useMemo(() => trailingTokenUsageRange(), [calendarRevision]);
  const queryAtom = useMemo(
    () =>
      environmentId === null
        ? null
        : serverEnvironment.tokenUsage({
            environmentId,
            input: {
              fromDate: range.fromDate,
              toDate: range.toDate,
              timeZone,
            },
          }),
    [environmentId, range.fromDate, range.toDate, timeZone],
  );
  const query = useEnvironmentQuery(queryAtom);
  const refresh = useCallback(() => {
    setCalendarRevision((revision) => revision + 1);
    query.refresh();
  }, [query.refresh]);

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(
      () => setCalendarRevision((revision) => revision + 1),
      Math.max(1, nextDay.getTime() - now.getTime() + 100),
    );
    const refreshVisibleCalendar = () => {
      if (document.visibilityState === "visible") {
        setCalendarRevision((revision) => revision + 1);
      }
    };
    document.addEventListener("visibilitychange", refreshVisibleCalendar);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", refreshVisibleCalendar);
    };
  }, [calendarRevision]);

  return {
    ...query,
    refresh,
    environmentId,
    range,
    timeZone,
  };
}
