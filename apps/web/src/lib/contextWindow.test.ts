import { describe, expect, it } from "vite-plus/test";
import { EventId, type OrchestrationThreadActivity, TurnId } from "@t3tools/contracts";

import {
  deriveLatestContextWindowSnapshot,
  deriveTurnTokenUsageByTurnId,
  formatContextWindowTokens,
  tokenUsageActivitiesSignature,
} from "./contextWindow";

function makeActivity(
  id: string,
  kind: string,
  payload: unknown,
  overrides?: Partial<Pick<OrchestrationThreadActivity, "turnId">>,
): OrchestrationThreadActivity {
  return {
    id: EventId.make(id),
    tone: "info",
    kind,
    summary: kind,
    payload,
    turnId: overrides && "turnId" in overrides ? overrides.turnId : TurnId.make("turn-1"),
    createdAt: "2026-03-23T00:00:00.000Z",
  };
}

describe("contextWindow", () => {
  it("derives the latest valid context window snapshot", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {
        usedTokens: 1000,
      }),
      makeActivity("activity-2", "tool.started", {}),
      makeActivity("activity-3", "context-window.updated", {
        usedTokens: 14_000,
        maxTokens: 258_000,
        compactsAutomatically: true,
      }),
    ]);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.usedTokens).toBe(14_000);
    expect(snapshot?.totalProcessedTokens).toBeNull();
    expect(snapshot?.maxTokens).toBe(258_000);
    expect(snapshot?.compactsAutomatically).toBe(true);
  });

  it("ignores malformed payloads", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {}),
    ]);

    expect(snapshot).toBeNull();
  });

  it("keeps valid zero-usage snapshots", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {
        usedTokens: 0,
        maxTokens: 100_000,
      }),
    ]);

    expect(snapshot).toMatchObject({
      usedTokens: 0,
      maxTokens: 100_000,
      remainingTokens: 100_000,
      usedPercentage: 0,
      remainingPercentage: 100,
    });
  });

  it("formats compact token counts", () => {
    expect(formatContextWindowTokens(999)).toBe("999");
    expect(formatContextWindowTokens(1400)).toBe("1.4k");
    expect(formatContextWindowTokens(14_000)).toBe("14k");
    expect(formatContextWindowTokens(258_000)).toBe("258k");
  });

  it("includes total processed tokens when available", () => {
    const snapshot = deriveLatestContextWindowSnapshot([
      makeActivity("activity-1", "context-window.updated", {
        usedTokens: 81_659,
        totalProcessedTokens: 748_126,
        maxTokens: 258_400,
        lastUsedTokens: 81_659,
      }),
    ]);

    expect(snapshot?.usedTokens).toBe(81_659);
    expect(snapshot?.totalProcessedTokens).toBe(748_126);
  });
});

describe("deriveTurnTokenUsageByTurnId", () => {
  const turn1 = TurnId.make("turn-1");
  const turn2 = TurnId.make("turn-2");
  const turn3 = TurnId.make("turn-3");

  it("derives per-turn production from consecutive cumulative totals, falling back to output for the first turn", () => {
    const usage = deriveTurnTokenUsageByTurnId([
      makeActivity("a1", "context-window.updated", {
        usedTokens: 500,
        totalProcessedTokens: 1000,
        inputTokens: 600,
        cachedInputTokens: 100,
        outputTokens: 300,
        reasoningOutputTokens: 50,
      }),
      makeActivity("a2", "tool.completed", {}),
      makeActivity(
        "a3",
        "context-window.updated",
        { usedTokens: 800, totalProcessedTokens: 3400, outputTokens: 900, toolUses: 4 },
        { turnId: turn2 },
      ),
    ]);

    expect(usage.get(turn1)).toMatchObject({
      producedTokens: 350,
      inputTokens: 600,
      cachedInputTokens: 100,
      outputTokens: 300,
      reasoningOutputTokens: 50,
    });
    // No baseline before turn-1's snapshot, so its production falls back to
    // the reported output side; turn-2 gets the exact cumulative delta.
    expect(usage.get(turn2)?.producedTokens).toBe(2400);
    expect(usage.get(turn2)?.outputTokens).toBe(900);
    expect(usage.get(turn2)?.toolUses).toBe(4);
  });

  it("advances the baseline across usage without a turn so it never leaks into the next delta", () => {
    const usage = deriveTurnTokenUsageByTurnId([
      makeActivity("a1", "context-window.updated", {
        usedTokens: 500,
        totalProcessedTokens: 1000,
      }),
      makeActivity(
        "a2",
        "context-window.updated",
        { usedTokens: 2000, totalProcessedTokens: 5000 },
        {
          turnId: null,
        },
      ),
      makeActivity(
        "a3",
        "context-window.updated",
        { usedTokens: 2200, totalProcessedTokens: 5600 },
        { turnId: turn2 },
      ),
    ]);

    expect(usage.has(turn1)).toBe(false);
    expect(usage.get(turn2)?.producedTokens).toBe(600);
  });

  it("hides turns with no usable production figures", () => {
    const usage = deriveTurnTokenUsageByTurnId([
      makeActivity("a1", "context-window.updated", { usedTokens: 400 }, { turnId: turn2 }),
    ]);

    expect(usage.size).toBe(0);
  });

  it("ignores malformed payloads and clamps non-monotonic cumulative totals", () => {
    const usage = deriveTurnTokenUsageByTurnId([
      makeActivity(
        "a1",
        "context-window.updated",
        { totalProcessedTokens: 1000 },
        {
          turnId: null,
        },
      ),
      makeActivity("a2", "context-window.updated", {}, { turnId: turn2 }),
      makeActivity(
        "a3",
        "context-window.updated",
        { usedTokens: 100, totalProcessedTokens: 300 },
        { turnId: turn2 },
      ),
    ]);

    // Cumulative counters reset (restart/compact): clamp to zero instead of
    // reporting a negative or inflated delta.
    expect(usage.has(turn2)).toBe(false);
  });

  it("sums output and reasoning when only those are reported", () => {
    const usage = deriveTurnTokenUsageByTurnId([
      makeActivity(
        "a1",
        "context-window.updated",
        { usedTokens: 700, outputTokens: 120, reasoningOutputTokens: 30 },
        { turnId: turn3 },
      ),
    ]);

    expect(usage.get(turn3)?.producedTokens).toBe(150);
  });
});

describe("tokenUsageActivitiesSignature", () => {
  it("changes when usage activities change and holds steady while other activities append", () => {
    const base = [
      makeActivity("a1", "context-window.updated", { usedTokens: 1 }),
      makeActivity("a2", "tool.started", {}),
    ];
    const signature = tokenUsageActivitiesSignature(base);

    expect(tokenUsageActivitiesSignature([...base, makeActivity("a3", "tool.completed", {})])).toBe(
      signature,
    );
    expect(
      tokenUsageActivitiesSignature([
        ...base,
        makeActivity("a4", "context-window.updated", { usedTokens: 2 }),
      ]),
    ).not.toBe(signature);
  });
});
