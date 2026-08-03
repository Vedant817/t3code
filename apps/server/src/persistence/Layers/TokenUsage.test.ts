import { assert, it } from "@effect/vitest";
import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlitePersistenceMemory } from "./Sqlite.ts";
import { TokenUsageRepositoryLive } from "./TokenUsage.ts";
import { TokenUsageRepository } from "../Services/TokenUsage.ts";

const layer = it.layer(TokenUsageRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

layer("TokenUsageRepository", (it) => {
  it.effect("deduplicates provider observations and buckets them in the requested timezone", () =>
    Effect.gen(function* () {
      const repository = yield* TokenUsageRepository;
      const fact = {
        provider: ProviderDriverKind.make("codex"),
        providerInstanceId: ProviderInstanceId.make("codex"),
        runtimeEventId: EventId.make("event-1"),
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-1"),
        occurredAt: "2026-01-02T02:00:00.000Z",
        observation: {
          sourceObservationId: "codex:turn:turn-1",
          sourceKind: "codex.thread-token-usage.last",
          model: "gpt-5.4",
          reasoningLevel: "high",
          metrics: {
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 50,
            reasoningOutputTokens: 10,
            totalTokens: 150,
          },
          metricsProvenance: "exact" as const,
          modelProvenance: "inferred" as const,
          reasoningProvenance: "inferred" as const,
        },
      };

      yield* repository.record(fact);
      yield* repository.record(fact);
      const olderMetrics = {
        inputTokens: 90,
        cachedInputTokens: 10,
        outputTokens: 60,
        reasoningOutputTokens: 5,
        totalTokens: 150,
      };
      yield* repository.record({
        ...fact,
        runtimeEventId: EventId.make("event-replayed-older"),
        occurredAt: "2026-01-02T01:00:00.000Z",
        observation: {
          ...fact.observation,
          model: "stale-model",
          metrics: olderMetrics,
        },
      });
      yield* repository.record({
        ...fact,
        runtimeEventId: EventId.make("event-richer-attribution"),
        occurredAt: "2026-01-02T01:00:00.000Z",
        observation: {
          ...fact.observation,
          model: "gpt-5.4-reported",
          modelProvenance: "exact",
          metrics: olderMetrics,
        },
      });

      const result = yield* repository.query({
        fromDate: "2026-01-01",
        toDate: "2026-01-02",
        timeZone: "America/New_York",
      });

      assert.strictEqual(result.days.length, 1);
      assert.strictEqual(result.days[0]?.date, "2026-01-01");
      assert.strictEqual(result.days[0]?.metrics.totalTokens, 150);
      assert.strictEqual(result.days[0]?.metrics.inputTokens, 100);
      assert.strictEqual(result.days[0]?.metrics.outputTokens, 50);
      assert.strictEqual(result.days[0]?.breakdown[0]?.model, "gpt-5.4-reported");
      assert.strictEqual(result.days[0]?.breakdown[0]?.modelProvenance, "exact");
      assert.strictEqual(result.days[0]?.breakdown[0]?.reasoningLevel, "high");
    }),
  );

  it.effect("isolates identical source observation ids by provider instance", () =>
    Effect.gen(function* () {
      const repository = yield* TokenUsageRepository;
      const observation = {
        sourceObservationId: "codex:turn:shared-turn",
        sourceKind: "codex.thread-token-usage.last",
        model: "gpt-5.4",
        reasoningLevel: null,
        metrics: {
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 5,
          reasoningOutputTokens: 0,
          totalTokens: 15,
        },
        metricsProvenance: "exact" as const,
        modelProvenance: "exact" as const,
        reasoningProvenance: "unknown" as const,
      };
      for (const [instanceId, eventId] of [
        ["codex_work", "event-work"],
        ["codex_personal", "event-personal"],
      ] as const) {
        yield* repository.record({
          provider: ProviderDriverKind.make("codex"),
          providerInstanceId: ProviderInstanceId.make(instanceId),
          runtimeEventId: EventId.make(eventId),
          threadId: ThreadId.make("thread-shared"),
          turnId: TurnId.make("shared-turn"),
          occurredAt: "2026-01-03T12:00:00.000Z",
          observation,
        });
      }

      const result = yield* repository.query({
        fromDate: "2026-01-03",
        toDate: "2026-01-03",
        timeZone: "UTC",
      });
      assert.strictEqual(result.days[0]?.metrics.totalTokens, 30);
    }),
  );

  it.effect("keeps unavailable component metrics unknown", () =>
    Effect.gen(function* () {
      const repository = yield* TokenUsageRepository;
      yield* repository.record({
        provider: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: null,
        runtimeEventId: EventId.make("event-unknown-components"),
        threadId: ThreadId.make("thread-2"),
        turnId: TurnId.make("turn-2"),
        occurredAt: "2026-02-01T12:00:00.000Z",
        observation: {
          sourceObservationId: "claude:turn:turn-2",
          sourceKind: "claude.result.usage",
          model: "claude-opus-4-6",
          reasoningLevel: null,
          metrics: {
            inputTokens: null,
            cachedInputTokens: null,
            outputTokens: null,
            reasoningOutputTokens: null,
            totalTokens: 500,
          },
          metricsProvenance: "exact",
          modelProvenance: "exact",
          reasoningProvenance: "unknown",
        },
      });

      const result = yield* repository.query({
        fromDate: "2026-02-01",
        toDate: "2026-02-01",
        timeZone: "UTC",
      });
      assert.strictEqual(result.days[0]?.metrics.totalTokens, 500);
      assert.strictEqual(result.days[0]?.metrics.inputTokens, null);
    }),
  );
});
