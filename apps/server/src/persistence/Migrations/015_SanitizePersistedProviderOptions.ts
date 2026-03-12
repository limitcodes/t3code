import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { sanitizeProviderOptionsRecordForPersistence } from "../../provider/providerOptions.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeJsonWithProviderOptions(jsonText: string | null): string | null {
  if (jsonText === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (!isRecord(parsed)) {
      return jsonText;
    }

    const next = { ...parsed };
    const providerOptions = sanitizeProviderOptionsRecordForPersistence(next.providerOptions);
    if (providerOptions === undefined) {
      delete next.providerOptions;
    } else {
      next.providerOptions = providerOptions;
    }
    return JSON.stringify(next);
  } catch {
    return jsonText;
  }
}

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const runtimeRows = yield* sql<{
    readonly threadId: string;
    readonly runtimePayloadJson: string | null;
  }>`
    SELECT thread_id AS "threadId", runtime_payload_json AS "runtimePayloadJson"
    FROM provider_session_runtime
    WHERE runtime_payload_json IS NOT NULL
  `;

  for (const row of runtimeRows) {
    const nextRuntimePayloadJson = sanitizeJsonWithProviderOptions(row.runtimePayloadJson);
    if (nextRuntimePayloadJson === row.runtimePayloadJson) {
      continue;
    }
    yield* sql`
      UPDATE provider_session_runtime
      SET runtime_payload_json = ${nextRuntimePayloadJson}
      WHERE thread_id = ${row.threadId}
    `;
  }

  const eventRows = yield* sql<{
    readonly sequence: number;
    readonly payloadJson: string;
  }>`
    SELECT sequence, payload_json AS "payloadJson"
    FROM orchestration_events
    WHERE event_type = 'thread.turn-start-requested'
  `;

  for (const row of eventRows) {
    const nextPayloadJson = sanitizeJsonWithProviderOptions(row.payloadJson);
    if (nextPayloadJson === row.payloadJson) {
      continue;
    }
    yield* sql`
      UPDATE orchestration_events
      SET payload_json = ${nextPayloadJson}
      WHERE sequence = ${row.sequence}
    `;
  }
});
