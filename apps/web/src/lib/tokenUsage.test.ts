import { describe, expect, it } from "vite-plus/test";

import {
  buildTokenUsageGrid,
  tokenUsageDateAfterKey,
  tokenUsageIntensity,
  trailingTokenUsageRange,
} from "./tokenUsage";

describe("token usage presentation helpers", () => {
  it("creates exactly 365 local calendar dates", () => {
    const range = trailingTokenUsageRange(new Date(2026, 0, 1, 12), 365);
    expect(range.dates).toHaveLength(365);
    expect(range.toDate).toBe("2026-01-01");
    expect(range.fromDate).toBe("2025-01-02");
  });

  it("lays dates out by weekday and retains sparse usage", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const weeks = buildTokenUsageGrid(dates, [
      {
        date: "2026-01-02",
        metrics: {
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 5,
          reasoningOutputTokens: 0,
          totalTokens: 15,
        },
        provenance: "exact",
        breakdown: [],
      },
    ]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.[4]?.date).toBe("2026-01-01");
    expect(weeks[0]?.[4]?.day).toBeNull();
    expect(weeks[0]?.[5]?.day?.metrics.totalTokens).toBe(15);
  });

  it("keeps unknown and zero totals at the empty intensity", () => {
    expect(tokenUsageIntensity(null, 100)).toBe(0);
    expect(tokenUsageIntensity(0, 100)).toBe(0);
    expect(tokenUsageIntensity(100, 100)).toBe(4);
  });

  it("moves through recorded and unrecorded grid dates with arrow keys", () => {
    const dates = Array.from(
      { length: 15 },
      (_, index) => `2026-01-${String(index + 1).padStart(2, "0")}`,
    );
    expect(tokenUsageDateAfterKey(dates, "2026-01-08", "ArrowLeft")).toBe("2026-01-01");
    expect(tokenUsageDateAfterKey(dates, "2026-01-08", "ArrowDown")).toBe("2026-01-09");
    expect(tokenUsageDateAfterKey(dates, "2026-01-08", "End")).toBe("2026-01-15");
  });
});
