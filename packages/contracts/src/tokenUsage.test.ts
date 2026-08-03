import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  ProviderTokenUsageObservation,
  TokenUsageQueryInput,
  TokenUsageQueryResult,
} from "./tokenUsage.ts";

const decodeObservation = Schema.decodeUnknownSync(ProviderTokenUsageObservation);
const decodeQuery = Schema.decodeUnknownSync(TokenUsageQueryInput);
const decodeResult = Schema.decodeUnknownSync(TokenUsageQueryResult);

describe("token usage contracts", () => {
  it("preserves nullable metrics and provenance", () => {
    const observation = decodeObservation({
      sourceObservationId: "codex:turn:turn-1",
      sourceKind: "codex.thread-token-usage.last",
      model: "gpt-5.4",
      reasoningLevel: "high",
      metrics: {
        inputTokens: 120,
        cachedInputTokens: null,
        outputTokens: 40,
        reasoningOutputTokens: null,
        totalTokens: 160,
      },
      metricsProvenance: "exact",
      modelProvenance: "inferred",
      reasoningProvenance: "inferred",
    });

    expect(observation.metrics.cachedInputTokens).toBeNull();
    expect(observation.metricsProvenance).toBe("exact");
  });

  it("rejects malformed dates and negative counts", () => {
    expect(() =>
      decodeQuery({ fromDate: "2026-1-01", toDate: "2026-01-02", timeZone: "UTC" }),
    ).toThrow();
    expect(() =>
      decodeObservation({
        sourceObservationId: "x",
        sourceKind: "test",
        model: null,
        reasoningLevel: null,
        metrics: {
          inputTokens: -1,
          cachedInputTokens: null,
          outputTokens: null,
          reasoningOutputTokens: null,
          totalTokens: null,
        },
        metricsProvenance: "unknown",
        modelProvenance: "unknown",
        reasoningProvenance: "unknown",
      }),
    ).toThrow();
  });

  it("decodes sparse daily results", () => {
    const result = decodeResult({
      fromDate: "2026-01-01",
      toDate: "2026-01-03",
      timeZone: "America/New_York",
      trackingStartedAt: null,
      days: [],
    });
    expect(result.days).toEqual([]);
  });
});
