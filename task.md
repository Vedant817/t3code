# Token Usage Analytics — Implementation Plan

## Product scope and decisions

- [x] Track usage for the current local T3 environment; do not merge other environments.
- [x] Ship a web-only **Settings → Usage** page in this change.
- [x] Show the browser-local trailing 365 calendar days.
- [x] Store immutable UTC timestamps and bucket them with the requested IANA timezone.
- [x] Record accurate usage going forward; do not backfill context-window snapshots.
- [x] Keep missing values unknown—never convert unavailable usage, model, or reasoning data to zero.
- [x] Keep context-window telemetry separate from token accounting.

## 1. Define usage accounting contracts

- [x] Add schema-only token usage contracts.
  - [x] Define accounting provenance (`exact`, `inferred`, `unknown`).
  - [x] Define nullable input, cached-input, output, reasoning-output, and total token metrics.
  - [x] Define requested and reported model/reasoning attribution fields.
  - [x] Define an idempotent provider accounting observation.
  - [x] Define validated calendar-date aggregate-query fields.
  - [x] Define sparse daily totals and model/reasoning breakdown response schemas.
- [x] Register the typed `server.getTokenUsage` RPC.
- [x] Add focused contract tests for dates, unknown metrics, and provenance.

## 2. Add the durable usage ledger

- [x] Add and register migration 35.
  - [x] Create the usage fact table with non-negative constraints.
  - [x] Add stable source-observation uniqueness for replay safety.
  - [x] Add timestamp, model/reasoning, and diagnostic indexes.
  - [x] Avoid historical snapshot backfill.
- [x] Add the usage persistence service and live SQL layer.
  - [x] Record exact/inferred observations idempotently.
  - [x] Replace duplicate metrics as one coherent observation, never per-column maxima.
  - [x] Preserve stronger model/reasoning attribution during replay.
  - [x] Aggregate a bounded UTC range into browser-local calendar days.
  - [x] Group selected-day data by provider, model, and reasoning level.
  - [x] Exclude non-numeric records from totals while retaining known zero usage.
- [x] Add focused migration/repository coverage.
  - [x] Duplicate observations do not inflate totals.
  - [x] Older/replayed observations do not create mixed metrics.
  - [x] Stronger exact attribution wins over inferred attribution.
  - [x] UTC-boundary timestamps bucket correctly.
  - [x] Unknown metrics stay unknown.

## 3. Capture provider usage

- [x] Codex accounting.
  - [x] Keep existing context-window snapshots unchanged.
  - [x] Emit a separate exact observation from provider-reported last-turn usage.
  - [x] Deduplicate cumulative last-turn updates by provider turn.
  - [x] Capture requested model and reasoning effort when provider payloads omit them.
- [x] Claude accounting.
  - [x] Normalize final SDK result usage only; do not count progress/context snapshots.
  - [x] Preserve exact per-model usage from `modelUsage`.
  - [x] Mark requested-model fallback and partial aggregate metrics as inferred.
  - [x] Preserve failed/cancelled turn usage when reported.
- [x] Other providers.
  - [x] Do not fabricate usage when stable terminal accounting data is unavailable.
- [x] Feed explicit accounting observations through provider runtime ingestion.
  - [x] Persist model/reasoning dimensions at observation time.
  - [x] Isolate accounting failures from the existing chat projection flow.
- [x] Add focused adapter, ingestion, and replay tests.

## 4. Expose an authenticated aggregate query

- [x] Add `server.getTokenUsage` to the WebSocket authorization scope map.
- [x] Implement the unary server handler and query-service dependency.
- [x] Validate IANA timezone and inclusive ranges of at most 365 days.
- [x] Return typed failures for invalid input and persistence errors.
- [x] Verify authenticated query behavior in the isolated integrated browser environment.

## 5. Build Settings → Usage

- [x] Add the Usage settings navigation item and file route.
- [x] Add primary-environment request state for the typed usage RPC.
- [x] Add date/grid presentation helpers.
  - [x] Calculate exactly 365 browser-local dates.
  - [x] Lay out weeks and weekdays across month/year boundaries.
  - [x] Derive intensity from known daily totals only.
- [x] Build the usage panel.
  - [x] Render an accessible GitHub-style daily grid.
  - [x] Distinguish absent, unknown, exact, inferred, and known-zero states.
  - [x] Support roving focus and arrow-key selection across every day.
  - [x] Show the selected day’s provider/model/reasoning breakdown.
  - [x] Show loading, retryable error, empty, and sparse-coverage states.
  - [x] Explain timezone, provider coverage, and tracking-start behavior.
- [x] Add focused helper and component tests.
- [x] Regenerate the TanStack route tree through the web build workflow.

## 6. Verify and review

- [x] Run focused contract tests.
- [x] Run focused repository, provider, ingestion, and RPC-path tests.
- [x] Run focused web helper and component tests.
- [x] Run affected-package formatting, lint, type checks, and web build.
- [x] Run one integrated `test-t3-app` browser verification.
  - [x] Authenticate through an isolated environment pairing URL.
  - [x] Verify Settings → Usage navigation and route.
  - [x] Verify the 365-day grid and local-timezone label.
  - [x] Verify empty state and seeded populated usage.
  - [x] Verify day selection and model/reasoning detail rendering.
  - [x] Verify 365 grid cells, roving selected state, and no page errors.
  - [x] Stop and remove the isolated verification environment.
- [x] Obtain independent diff reviews and resolve all blocker/high findings.
- [x] Resolve post-implementation QA findings.
  - [x] Reject stale equal-total metric replays unless their observation timestamp is newer.
  - [x] Preserve custom Codex and Claude provider instance IDs through accounting persistence.
  - [x] Render seven valid ARIA rows containing all 365 gridcells.
  - [x] Recompute the local date range/timezone at midnight, visibility return, and manual retry.
  - [x] Add direct authenticated, authorization, validation, and persistence-failure RPC tests.
  - [x] Bound Windows editor discovery so server configuration cannot remain blocked indefinitely.
- [x] Confirm no files are staged.

## Verification evidence

- `vp test run` across the nine focused contract, provider runtime, usage repository, adapter, ingestion, web, and server integration files: **268/268 passed**.
- Affected package type checks for contracts, client-runtime, server, and web: **passed**; the server layer composition reports zero TypeScript errors.
- Targeted lint for the changed production files and focused new tests: **passed**.
- Web build and generated route tree: **passed**.
- `apps/server/src/server.test.ts`: **115/115 passed**, including direct token-usage RPC and bounded editor-discovery coverage on Windows.
- Isolated browser verification:
  - authenticated and opened `/settings/usage`;
  - observed exactly 365 accessible grid cells owned by seven ARIA rows;
  - verified one roving tab stop and keyboard selection across weeks;
  - verified empty state;
  - seeded disposable Codex and Claude facts after stopping the server;
  - verified daily total, per-model rows, reasoning levels, inferred labels, and prior-day selection;
  - observed no page errors;
  - stopped the environment and removed disposable state.

## Residual risks

- Accurate accounting is available going forward only; existing context-window history is intentionally not backfilled.
- Codex and Claude are the currently supported accounting sources. Other providers remain sparse until they expose stable terminal usage identities and metrics.
- Codex accounting treats `tokenUsage.last` as the cumulative last-turn snapshot and keeps the strongest/latest coherent observation for that provider turn.
- Windows editor discovery is now bounded to two seconds while loading server configuration; a timeout returns an empty editor list and logs a warning instead of blocking environment recovery.
- `ProviderRuntimeIngestion.test.ts` has a pre-existing targeted-lint violation (`no-manual-effect-runtime-in-tests`) outside the added accounting test; all focused tests and package type checks pass.
