import {
  type TokenUsageBreakdown,
  type TokenUsageDay,
  type TokenUsageMetrics,
  type TokenUsageProvenance,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";
import {
  RecordTokenUsageFactInput,
  TokenUsageRepository,
  type TokenUsageRepositoryShape,
} from "../Services/TokenUsage.ts";

const QueryBounds = Schema.Struct({
  fromUtc: Schema.String,
  toUtc: Schema.String,
});

const UsageFactRow = Schema.Struct({
  provider: Schema.String,
  occurredAt: Schema.String,
  model: Schema.NullOr(Schema.String),
  reasoningLevel: Schema.NullOr(Schema.String),
  inputTokens: Schema.NullOr(Schema.Number),
  cachedInputTokens: Schema.NullOr(Schema.Number),
  outputTokens: Schema.NullOr(Schema.Number),
  reasoningOutputTokens: Schema.NullOr(Schema.Number),
  totalTokens: Schema.NullOr(Schema.Number),
  metricsProvenance: Schema.Literals(["exact", "inferred", "unknown"]),
  modelProvenance: Schema.Literals(["exact", "inferred", "unknown"]),
  reasoningProvenance: Schema.Literals(["exact", "inferred", "unknown"]),
});
type UsageFactRow = typeof UsageFactRow.Type;

const TrackingStartRow = Schema.Struct({ trackingStartedAt: Schema.NullOr(Schema.String) });

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

function addUtcDays(calendarDate: string, days: number): string {
  const date = new Date(`${calendarDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function localCalendarDate(occurredAt: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(occurredAt));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function combineProvenance(values: ReadonlyArray<TokenUsageProvenance>): TokenUsageProvenance {
  if (values.some((value) => value === "unknown")) return "unknown";
  if (values.some((value) => value === "inferred")) return "inferred";
  return "exact";
}

function sumKnown(
  rows: ReadonlyArray<UsageFactRow>,
  key: keyof Pick<
    UsageFactRow,
    "inputTokens" | "cachedInputTokens" | "outputTokens" | "reasoningOutputTokens" | "totalTokens"
  >,
): number | null {
  let total = 0;
  for (const row of rows) {
    const value = row[key];
    if (value === null) return null;
    total += value;
  }
  return total;
}

function aggregateMetrics(rows: ReadonlyArray<UsageFactRow>): TokenUsageMetrics {
  return {
    inputTokens: sumKnown(rows, "inputTokens"),
    cachedInputTokens: sumKnown(rows, "cachedInputTokens"),
    outputTokens: sumKnown(rows, "outputTokens"),
    reasoningOutputTokens: sumKnown(rows, "reasoningOutputTokens"),
    totalTokens: sumKnown(rows, "totalTokens"),
  };
}

function aggregateRows(rows: ReadonlyArray<UsageFactRow>, date: string): TokenUsageDay {
  const byDimension = new Map<string, UsageFactRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.provider, row.model, row.reasoningLevel]);
    const current = byDimension.get(key) ?? [];
    current.push(row);
    byDimension.set(key, current);
  }

  const breakdown: TokenUsageBreakdown[] = [...byDimension.values()]
    .map((group) => ({
      provider: group[0]!.provider,
      model: group[0]!.model,
      reasoningLevel: group[0]!.reasoningLevel,
      metrics: aggregateMetrics(group),
      metricsProvenance: combineProvenance(group.map((row) => row.metricsProvenance)),
      modelProvenance: combineProvenance(group.map((row) => row.modelProvenance)),
      reasoningProvenance: combineProvenance(group.map((row) => row.reasoningProvenance)),
    }))
    .toSorted((left, right) =>
      `${left.provider}:${left.model ?? ""}:${left.reasoningLevel ?? ""}`.localeCompare(
        `${right.provider}:${right.model ?? ""}:${right.reasoningLevel ?? ""}`,
      ),
    );

  return {
    date,
    metrics: aggregateMetrics(rows),
    provenance: combineProvenance(rows.map((row) => row.metricsProvenance)),
    breakdown,
  };
}

const makeTokenUsageRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const recordFact = SqlSchema.void({
    Request: RecordTokenUsageFactInput,
    execute: (input) => {
      const providerIdentity = input.providerInstanceId ?? `driver:${input.provider}`;
      const { metrics } = input.observation;
      return sql`
        INSERT INTO provider_token_usage_facts (
          provider_identity,
          provider_driver,
          provider_instance_id,
          source_observation_id,
          source_kind,
          runtime_event_id,
          thread_id,
          turn_id,
          occurred_at,
          model,
          reasoning_level,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          reasoning_output_tokens,
          total_tokens,
          metrics_provenance,
          model_provenance,
          reasoning_provenance
        ) VALUES (
          ${providerIdentity},
          ${input.provider},
          ${input.providerInstanceId},
          ${input.observation.sourceObservationId},
          ${input.observation.sourceKind},
          ${input.runtimeEventId},
          ${input.threadId},
          ${input.turnId},
          ${input.occurredAt},
          ${input.observation.model},
          ${input.observation.reasoningLevel},
          ${metrics.inputTokens},
          ${metrics.cachedInputTokens},
          ${metrics.outputTokens},
          ${metrics.reasoningOutputTokens},
          ${metrics.totalTokens},
          ${input.observation.metricsProvenance},
          ${input.observation.modelProvenance},
          ${input.observation.reasoningProvenance}
        )
        ON CONFLICT (provider_identity, source_observation_id)
        DO UPDATE SET
          runtime_event_id = excluded.runtime_event_id,
          thread_id = excluded.thread_id,
          turn_id = COALESCE(excluded.turn_id, provider_token_usage_facts.turn_id),
          occurred_at = MAX(excluded.occurred_at, provider_token_usage_facts.occurred_at),
          model = CASE
            WHEN excluded.model IS NULL THEN provider_token_usage_facts.model
            WHEN provider_token_usage_facts.model IS NULL THEN excluded.model
            WHEN CASE excluded.model_provenance
              WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              > CASE provider_token_usage_facts.model_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              THEN excluded.model
            ELSE provider_token_usage_facts.model
          END,
          reasoning_level = CASE
            WHEN excluded.reasoning_level IS NULL THEN provider_token_usage_facts.reasoning_level
            WHEN provider_token_usage_facts.reasoning_level IS NULL THEN excluded.reasoning_level
            WHEN CASE excluded.reasoning_provenance
              WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              > CASE provider_token_usage_facts.reasoning_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              THEN excluded.reasoning_level
            ELSE provider_token_usage_facts.reasoning_level
          END,
          input_tokens = CASE
            WHEN (
              CASE excluded.metrics_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
                > CASE provider_token_usage_facts.metrics_provenance
                  WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
            ) OR (
              excluded.metrics_provenance = provider_token_usage_facts.metrics_provenance
              AND excluded.total_tokens IS NOT NULL
              AND (
                provider_token_usage_facts.total_tokens IS NULL
                OR excluded.total_tokens > provider_token_usage_facts.total_tokens
                OR (
                  excluded.total_tokens = provider_token_usage_facts.total_tokens
                  AND excluded.occurred_at > provider_token_usage_facts.occurred_at
                )
              )
            ) THEN excluded.input_tokens
            ELSE provider_token_usage_facts.input_tokens
          END,
          cached_input_tokens = CASE
            WHEN (
              CASE excluded.metrics_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
                > CASE provider_token_usage_facts.metrics_provenance
                  WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
            ) OR (
              excluded.metrics_provenance = provider_token_usage_facts.metrics_provenance
              AND excluded.total_tokens IS NOT NULL
              AND (
                provider_token_usage_facts.total_tokens IS NULL
                OR excluded.total_tokens > provider_token_usage_facts.total_tokens
                OR (
                  excluded.total_tokens = provider_token_usage_facts.total_tokens
                  AND excluded.occurred_at > provider_token_usage_facts.occurred_at
                )
              )
            ) THEN excluded.cached_input_tokens
            ELSE provider_token_usage_facts.cached_input_tokens
          END,
          output_tokens = CASE
            WHEN (
              CASE excluded.metrics_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
                > CASE provider_token_usage_facts.metrics_provenance
                  WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
            ) OR (
              excluded.metrics_provenance = provider_token_usage_facts.metrics_provenance
              AND excluded.total_tokens IS NOT NULL
              AND (
                provider_token_usage_facts.total_tokens IS NULL
                OR excluded.total_tokens > provider_token_usage_facts.total_tokens
                OR (
                  excluded.total_tokens = provider_token_usage_facts.total_tokens
                  AND excluded.occurred_at > provider_token_usage_facts.occurred_at
                )
              )
            ) THEN excluded.output_tokens
            ELSE provider_token_usage_facts.output_tokens
          END,
          reasoning_output_tokens = CASE
            WHEN (
              CASE excluded.metrics_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
                > CASE provider_token_usage_facts.metrics_provenance
                  WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
            ) OR (
              excluded.metrics_provenance = provider_token_usage_facts.metrics_provenance
              AND excluded.total_tokens IS NOT NULL
              AND (
                provider_token_usage_facts.total_tokens IS NULL
                OR excluded.total_tokens > provider_token_usage_facts.total_tokens
                OR (
                  excluded.total_tokens = provider_token_usage_facts.total_tokens
                  AND excluded.occurred_at > provider_token_usage_facts.occurred_at
                )
              )
            ) THEN excluded.reasoning_output_tokens
            ELSE provider_token_usage_facts.reasoning_output_tokens
          END,
          total_tokens = CASE
            WHEN (
              CASE excluded.metrics_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
                > CASE provider_token_usage_facts.metrics_provenance
                  WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
            ) OR (
              excluded.metrics_provenance = provider_token_usage_facts.metrics_provenance
              AND excluded.total_tokens IS NOT NULL
              AND (
                provider_token_usage_facts.total_tokens IS NULL
                OR excluded.total_tokens > provider_token_usage_facts.total_tokens
                OR (
                  excluded.total_tokens = provider_token_usage_facts.total_tokens
                  AND excluded.occurred_at > provider_token_usage_facts.occurred_at
                )
              )
            ) THEN excluded.total_tokens
            ELSE provider_token_usage_facts.total_tokens
          END,
          metrics_provenance = CASE
            WHEN CASE excluded.metrics_provenance
              WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              > CASE provider_token_usage_facts.metrics_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              THEN excluded.metrics_provenance
            ELSE provider_token_usage_facts.metrics_provenance
          END,
          model_provenance = CASE
            WHEN CASE excluded.model_provenance
              WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              > CASE provider_token_usage_facts.model_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              THEN excluded.model_provenance
            ELSE provider_token_usage_facts.model_provenance
          END,
          reasoning_provenance = CASE
            WHEN CASE excluded.reasoning_provenance
              WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              > CASE provider_token_usage_facts.reasoning_provenance
                WHEN 'exact' THEN 2 WHEN 'inferred' THEN 1 ELSE 0 END
              THEN excluded.reasoning_provenance
            ELSE provider_token_usage_facts.reasoning_provenance
          END
      `;
    },
  });

  const listFacts = SqlSchema.findAll({
    Request: QueryBounds,
    Result: UsageFactRow,
    execute: ({ fromUtc, toUtc }) => sql`
      SELECT
        provider_driver AS "provider",
        occurred_at AS "occurredAt",
        model,
        reasoning_level AS "reasoningLevel",
        input_tokens AS "inputTokens",
        cached_input_tokens AS "cachedInputTokens",
        output_tokens AS "outputTokens",
        reasoning_output_tokens AS "reasoningOutputTokens",
        total_tokens AS "totalTokens",
        metrics_provenance AS "metricsProvenance",
        model_provenance AS "modelProvenance",
        reasoning_provenance AS "reasoningProvenance"
      FROM provider_token_usage_facts
      WHERE occurred_at >= ${fromUtc}
        AND occurred_at < ${toUtc}
        AND total_tokens IS NOT NULL
      ORDER BY occurred_at ASC, id ASC
    `,
  });

  const readTrackingStart = SqlSchema.findOne({
    Request: Schema.Struct({}),
    Result: TrackingStartRow,
    execute: () => sql`
      SELECT MIN(occurred_at) AS "trackingStartedAt"
      FROM provider_token_usage_facts
      WHERE total_tokens IS NOT NULL
    `,
  });

  const record: TokenUsageRepositoryShape["record"] = (input) =>
    recordFact(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "TokenUsageRepository.record:query",
          "TokenUsageRepository.record:encodeRequest",
        ),
      ),
    );

  const query: TokenUsageRepositoryShape["query"] = (input) =>
    Effect.gen(function* () {
      const rows = yield* listFacts({
        fromUtc: addUtcDays(input.fromDate, -2),
        toUtc: addUtcDays(input.toDate, 3),
      });
      const trackingStart = yield* readTrackingStart({});
      const byDate = new Map<string, UsageFactRow[]>();
      for (const row of rows) {
        const date = localCalendarDate(row.occurredAt, input.timeZone);
        if (date < input.fromDate || date > input.toDate) continue;
        const current = byDate.get(date) ?? [];
        current.push(row);
        byDate.set(date, current);
      }
      return {
        fromDate: input.fromDate,
        toDate: input.toDate,
        timeZone: input.timeZone,
        trackingStartedAt: trackingStart.trackingStartedAt,
        days: [...byDate.entries()]
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([date, dayRows]) => aggregateRows(dayRows, date)),
      };
    }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "TokenUsageRepository.query:query",
          "TokenUsageRepository.query:decodeRows",
        ),
      ),
    );

  return TokenUsageRepository.of({ record, query });
});

export const TokenUsageRepositoryLive = Layer.effect(
  TokenUsageRepository,
  makeTokenUsageRepository,
);
