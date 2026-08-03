import * as Schema from "effect/Schema";

import { NonNegativeInt } from "./baseSchemas.ts";

const TrimmedNonEmptyString = Schema.Trimmed.check(Schema.isNonEmpty());

export const TokenUsageProvenance = Schema.Literals(["exact", "inferred", "unknown"]);
export type TokenUsageProvenance = typeof TokenUsageProvenance.Type;

export const TokenUsageMetrics = Schema.Struct({
  inputTokens: Schema.NullOr(NonNegativeInt),
  cachedInputTokens: Schema.NullOr(NonNegativeInt),
  outputTokens: Schema.NullOr(NonNegativeInt),
  reasoningOutputTokens: Schema.NullOr(NonNegativeInt),
  totalTokens: Schema.NullOr(NonNegativeInt),
});
export type TokenUsageMetrics = typeof TokenUsageMetrics.Type;

/**
 * An immutable provider accounting observation. This is deliberately separate
 * from context-window telemetry: observations may be summed only after the
 * server has deduplicated them by sourceObservationId.
 */
export const ProviderTokenUsageObservation = Schema.Struct({
  sourceObservationId: TrimmedNonEmptyString,
  sourceKind: TrimmedNonEmptyString,
  model: Schema.NullOr(TrimmedNonEmptyString),
  reasoningLevel: Schema.NullOr(TrimmedNonEmptyString),
  metrics: TokenUsageMetrics,
  metricsProvenance: TokenUsageProvenance,
  modelProvenance: TokenUsageProvenance,
  reasoningProvenance: TokenUsageProvenance,
});
export type ProviderTokenUsageObservation = typeof ProviderTokenUsageObservation.Type;

export const TokenUsageCalendarDate = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/));
export type TokenUsageCalendarDate = typeof TokenUsageCalendarDate.Type;

export const TokenUsageQueryInput = Schema.Struct({
  fromDate: TokenUsageCalendarDate,
  toDate: TokenUsageCalendarDate,
  timeZone: TrimmedNonEmptyString,
});
export type TokenUsageQueryInput = typeof TokenUsageQueryInput.Type;

export const TokenUsageBreakdown = Schema.Struct({
  provider: TrimmedNonEmptyString,
  model: Schema.NullOr(TrimmedNonEmptyString),
  reasoningLevel: Schema.NullOr(TrimmedNonEmptyString),
  metrics: TokenUsageMetrics,
  metricsProvenance: TokenUsageProvenance,
  modelProvenance: TokenUsageProvenance,
  reasoningProvenance: TokenUsageProvenance,
});
export type TokenUsageBreakdown = typeof TokenUsageBreakdown.Type;

export const TokenUsageDay = Schema.Struct({
  date: TokenUsageCalendarDate,
  metrics: TokenUsageMetrics,
  provenance: TokenUsageProvenance,
  breakdown: Schema.Array(TokenUsageBreakdown),
});
export type TokenUsageDay = typeof TokenUsageDay.Type;

export const TokenUsageQueryResult = Schema.Struct({
  fromDate: TokenUsageCalendarDate,
  toDate: TokenUsageCalendarDate,
  timeZone: TrimmedNonEmptyString,
  trackingStartedAt: Schema.NullOr(Schema.String),
  days: Schema.Array(TokenUsageDay),
});
export type TokenUsageQueryResult = typeof TokenUsageQueryResult.Type;

export class TokenUsageQueryError extends Schema.TaggedErrorClass<TokenUsageQueryError>()(
  "TokenUsageQueryError",
  {
    reason: Schema.Literals(["invalid-range", "invalid-time-zone", "persistence"]),
    message: Schema.String,
  },
) {}
