import {
  EventId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderTokenUsageObservation,
  ThreadId,
  TokenUsageQueryInput,
  TokenUsageQueryResult,
  TurnId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const RecordTokenUsageFactInput = Schema.Struct({
  provider: ProviderDriverKind,
  providerInstanceId: Schema.NullOr(ProviderInstanceId),
  runtimeEventId: EventId,
  threadId: ThreadId,
  turnId: Schema.NullOr(TurnId),
  occurredAt: Schema.String,
  observation: ProviderTokenUsageObservation,
});
export type RecordTokenUsageFactInput = typeof RecordTokenUsageFactInput.Type;

export interface TokenUsageRepositoryShape {
  readonly record: (
    input: RecordTokenUsageFactInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly query: (
    input: TokenUsageQueryInput,
  ) => Effect.Effect<TokenUsageQueryResult, ProjectionRepositoryError>;
}

export class TokenUsageRepository extends Context.Service<
  TokenUsageRepository,
  TokenUsageRepositoryShape
>()("t3/persistence/Services/TokenUsage/TokenUsageRepository") {}
