import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS provider_token_usage_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_identity TEXT NOT NULL,
      provider_driver TEXT NOT NULL,
      provider_instance_id TEXT,
      source_observation_id TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      runtime_event_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      turn_id TEXT,
      occurred_at TEXT NOT NULL,
      model TEXT,
      reasoning_level TEXT,
      input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
      cached_input_tokens INTEGER CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
      output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
      reasoning_output_tokens INTEGER CHECK (
        reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0
      ),
      total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
      metrics_provenance TEXT NOT NULL CHECK (
        metrics_provenance IN ('exact', 'inferred', 'unknown')
      ),
      model_provenance TEXT NOT NULL CHECK (
        model_provenance IN ('exact', 'inferred', 'unknown')
      ),
      reasoning_provenance TEXT NOT NULL CHECK (
        reasoning_provenance IN ('exact', 'inferred', 'unknown')
      ),
      UNIQUE (provider_identity, source_observation_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_provider_token_usage_facts_occurred_at
    ON provider_token_usage_facts(occurred_at)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_provider_token_usage_facts_time_model_reasoning
    ON provider_token_usage_facts(occurred_at, model, reasoning_level)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_provider_token_usage_facts_thread_turn
    ON provider_token_usage_facts(thread_id, turn_id)
  `;
});
