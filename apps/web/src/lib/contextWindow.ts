import type {
  OrchestrationThreadActivity,
  ThreadTokenUsageSnapshot,
  TurnId,
} from "@t3tools/contracts";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

type NullableContextWindowUsage = {
  readonly [Key in keyof ThreadTokenUsageSnapshot]: undefined extends ThreadTokenUsageSnapshot[Key]
    ? Exclude<ThreadTokenUsageSnapshot[Key], undefined> | null
    : ThreadTokenUsageSnapshot[Key];
};

export type ContextWindowSnapshot = NullableContextWindowUsage & {
  readonly remainingTokens: number | null;
  readonly usedPercentage: number | null;
  readonly remainingPercentage: number | null;
  readonly updatedAt: string;
};

/** Map a provider driver kind to a user-facing display name. */
export function formatProviderDisplayName(provider: string | null | undefined): string {
  if (!provider) return "This agent";
  switch (provider) {
    case "claudeAgent":
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "opencode":
      return "OpenCode";
    default: {
      // Title-case unknown driver kinds so they read reasonably.
      const trimmed = provider.replace(/Agent$/i, "").trim();
      if (trimmed.length === 0) return provider;
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
  }
}

export function deriveLatestContextWindowSnapshot(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): ContextWindowSnapshot | null {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "context-window.updated") {
      continue;
    }

    const payload = asRecord(activity.payload);
    const usedTokens = asFiniteNumber(payload?.usedTokens);
    if (usedTokens === null || usedTokens < 0) {
      continue;
    }

    const maxTokens = asFiniteNumber(payload?.maxTokens);
    const usedPercentage =
      maxTokens !== null && maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null;
    const remainingTokens =
      maxTokens !== null ? Math.max(0, Math.round(maxTokens - usedTokens)) : null;
    const remainingPercentage = usedPercentage !== null ? Math.max(0, 100 - usedPercentage) : null;

    return {
      usedTokens,
      totalProcessedTokens: asFiniteNumber(payload?.totalProcessedTokens),
      maxTokens,
      remainingTokens,
      usedPercentage,
      remainingPercentage,
      inputTokens: asFiniteNumber(payload?.inputTokens),
      cachedInputTokens: asFiniteNumber(payload?.cachedInputTokens),
      outputTokens: asFiniteNumber(payload?.outputTokens),
      reasoningOutputTokens: asFiniteNumber(payload?.reasoningOutputTokens),
      lastUsedTokens: asFiniteNumber(payload?.lastUsedTokens),
      lastInputTokens: asFiniteNumber(payload?.lastInputTokens),
      lastCachedInputTokens: asFiniteNumber(payload?.lastCachedInputTokens),
      lastOutputTokens: asFiniteNumber(payload?.lastOutputTokens),
      lastReasoningOutputTokens: asFiniteNumber(payload?.lastReasoningOutputTokens),
      toolUses: asFiniteNumber(payload?.toolUses),
      durationMs: asFiniteNumber(payload?.durationMs),
      compactsAutomatically: asBoolean(payload?.compactsAutomatically) ?? false,
      updatedAt: activity.createdAt,
    };
  }

  return null;
}

export function formatContextWindowTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "0";
  }
  if (value < 1_000) {
    return `${Math.round(value)}`;
  }
  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (value < 1_000_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}

// ---------------------------------------------------------------------------
// Per-turn token usage — what a response cost to produce. Providers report
// usage as `context-window.updated` activities carrying a
// ThreadTokenUsageSnapshot; the snapshot is context-shaped (cumulative), so
// production is derived as the delta of `totalProcessedTokens` between
// consecutive snapshots, falling back to the reported output side when no
// baseline exists in the loaded activity window.
// ---------------------------------------------------------------------------

export type TurnTokenUsageSummary = {
  readonly turnId: TurnId;
  /**
   * Tokens processed to produce this turn's outputs — text, code edits,
   * tool calls, and thinking combined. Null when the provider reported
   * nothing usable.
   */
  readonly producedTokens: number | null;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningOutputTokens: number | null;
  readonly toolUses: number | null;
  readonly durationMs: number | null;
};

interface TurnTokenUsageAccumulator {
  startTotal: number | null;
  endTotal: number | null;
  fallbackOutput: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  toolUses: number | null;
  durationMs: number | null;
}

/**
 * Derive per-turn token usage summaries from thread activities, keyed by the
 * turn that produced them. Usage activities without a turn still advance the
 * cumulative baseline so their tokens never leak into the next turn's delta.
 */
export function deriveTurnTokenUsageByTurnId(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): Map<TurnId, TurnTokenUsageSummary> {
  const byTurnId = new Map<TurnId, TurnTokenUsageAccumulator>();
  let previousTotal: number | null = null;

  for (const activity of activities) {
    if (activity.kind !== "context-window.updated") {
      continue;
    }

    const payload = asRecord(activity.payload);
    const totalProcessedTokens = asFiniteNumber(payload?.totalProcessedTokens);
    const usedTokens = asFiniteNumber(payload?.usedTokens);
    const outputTokens = asFiniteNumber(payload?.outputTokens);
    const reasoningOutputTokens = asFiniteNumber(payload?.reasoningOutputTokens);

    if (activity.turnId !== null && usedTokens !== null && usedTokens >= 0) {
      let accumulator = byTurnId.get(activity.turnId);
      if (!accumulator) {
        accumulator = {
          startTotal: null,
          endTotal: null,
          fallbackOutput: null,
          inputTokens: null,
          cachedInputTokens: null,
          outputTokens: null,
          reasoningOutputTokens: null,
          toolUses: null,
          durationMs: null,
        };
        byTurnId.set(activity.turnId, accumulator);
      }

      if (totalProcessedTokens !== null && totalProcessedTokens > 0) {
        // First snapshot of the turn records where production starts from;
        // no baseline (session start or truncated history) means the delta
        // is unusable and the output-side fallback takes over.
        accumulator.startTotal ??= previousTotal;
        accumulator.endTotal = totalProcessedTokens;
      }

      const reportedOutput =
        (outputTokens ?? 0) + (reasoningOutputTokens ?? 0) > 0
          ? (outputTokens ?? 0) + (reasoningOutputTokens ?? 0)
          : null;
      accumulator.fallbackOutput ??= reportedOutput;

      // Latest request wins: these fields describe the closing API call,
      // which is the most representative breakdown for the turn.
      accumulator.inputTokens = asFiniteNumber(payload?.inputTokens);
      accumulator.cachedInputTokens = asFiniteNumber(payload?.cachedInputTokens);
      accumulator.outputTokens = outputTokens;
      accumulator.reasoningOutputTokens = reasoningOutputTokens;
      accumulator.toolUses = asFiniteNumber(payload?.toolUses);
      accumulator.durationMs = asFiniteNumber(payload?.durationMs);
    }

    if (totalProcessedTokens !== null && totalProcessedTokens > 0) {
      previousTotal = totalProcessedTokens;
    }
  }

  const result = new Map<TurnId, TurnTokenUsageSummary>();
  for (const [turnId, accumulator] of byTurnId) {
    const producedTokens =
      accumulator.endTotal !== null && accumulator.startTotal !== null
        ? Math.max(0, accumulator.endTotal - accumulator.startTotal)
        : accumulator.fallbackOutput;
    if (producedTokens === null || producedTokens <= 0) {
      continue;
    }
    result.set(turnId, {
      turnId,
      producedTokens,
      inputTokens: accumulator.inputTokens,
      cachedInputTokens: accumulator.cachedInputTokens,
      outputTokens: accumulator.outputTokens,
      reasoningOutputTokens: accumulator.reasoningOutputTokens,
      toolUses: accumulator.toolUses,
      durationMs: accumulator.durationMs,
    });
  }
  return result;
}

/**
 * Cheap identity for the usage-bearing slice of an activity list. Activities
 * only ever append (or slide at the projection cap), so last-usage id plus
 * count detects every change without hashing payloads.
 */
export function tokenUsageActivitiesSignature(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): string {
  let count = 0;
  let lastId = "";
  for (const activity of activities) {
    if (activity.kind === "context-window.updated") {
      count += 1;
      lastId = activity.id;
    }
  }
  return `${count}:${lastId}`;
}
