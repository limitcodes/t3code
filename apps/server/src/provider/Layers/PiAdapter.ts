import {
  type ProviderRuntimeEvent,
  type ProviderUserInputAnswers,
} from "@t3tools/contracts";
import { Effect, Layer, Queue, Stream } from "effect";

import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionClosedError,
  ProviderAdapterSessionNotFoundError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { PiRpcManager } from "../../piRpcManager.ts";
import { PiAdapter, type PiAdapterShape } from "../Services/PiAdapter.ts";

const PROVIDER = "pi" as const;

export interface PiAdapterLiveOptions {
  readonly manager?: PiRpcManager;
  readonly makeManager?: () => PiRpcManager;
}

function toMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return fallback;
}

function toSessionError(
  threadId: string,
  cause: unknown,
): ProviderAdapterSessionNotFoundError | ProviderAdapterSessionClosedError | undefined {
  const normalized = toMessage(cause, "").toLowerCase();
  if (normalized.includes("unknown pi session")) {
    return new ProviderAdapterSessionNotFoundError({
      provider: PROVIDER,
      threadId,
      cause,
    });
  }
  if (normalized.includes("session is closed")) {
    return new ProviderAdapterSessionClosedError({
      provider: PROVIDER,
      threadId,
      cause,
    });
  }
  return undefined;
}

function toRequestError(threadId: string, method: string, cause: unknown): ProviderAdapterError {
  const sessionError = toSessionError(threadId, cause);
  if (sessionError) {
    return sessionError;
  }
  return new ProviderAdapterRequestError({
    provider: PROVIDER,
    method,
    detail: toMessage(cause, `${method} failed`),
    cause,
  });
}

export const makePiAdapterLive = (options: PiAdapterLiveOptions) =>
  Layer.effect(
    PiAdapter,
    Effect.gen(function* () {
      const eventQueue = yield* Queue.unbounded<ProviderRuntimeEvent>();
      const manager = options.manager ?? options.makeManager?.();
      if (!manager) {
        throw new Error("Pi adapter requires a Pi RPC manager.");
      }

      const handleEvent = (event: ProviderRuntimeEvent) => {
        void Effect.runPromise(Queue.offer(eventQueue, event).pipe(Effect.asVoid));
      };
      manager.on("event", handleEvent);

      const streamEvents = Stream.fromQueue(eventQueue);

      const startSession: PiAdapterShape["startSession"] = (input) =>
        Effect.tryPromise({
          try: () =>
            manager.startSession({
              threadId: input.threadId,
              provider: "pi",
              ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
              ...(input.model !== undefined ? { model: input.model } : {}),
              ...(input.resumeCursor !== undefined ? { resumeCursor: input.resumeCursor } : {}),
              ...(input.providerOptions !== undefined ? { providerOptions: input.providerOptions } : {}),
              runtimeMode: input.runtimeMode,
            }),
          catch: (cause) => toRequestError(input.threadId, "session/start", cause),
        });

      const sendTurn: PiAdapterShape["sendTurn"] = (input) =>
        Effect.tryPromise({
          try: () =>
            manager.sendTurn({
              threadId: input.threadId,
              ...(input.input !== undefined ? { input: input.input } : {}),
              ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
              ...(input.model !== undefined ? { model: input.model } : {}),
            }),
          catch: (cause) => toRequestError(input.threadId, "session/prompt", cause),
        });

      const interruptTurn: PiAdapterShape["interruptTurn"] = (threadId, turnId) =>
        Effect.tryPromise({
          try: () => manager.interruptTurn(threadId, turnId),
          catch: (cause) => toRequestError(threadId, "session/cancel", cause),
        });

      const respondToRequest: PiAdapterShape["respondToRequest"] = (
        threadId,
        requestId,
        decision,
      ) =>
        Effect.tryPromise({
          try: () => manager.respondToRequest(threadId, requestId, decision),
          catch: (cause) => toRequestError(threadId, "request/respond", cause),
        });

      const respondToUserInput: PiAdapterShape["respondToUserInput"] = (
        threadId,
        requestId,
        answers: ProviderUserInputAnswers,
      ) =>
        Effect.tryPromise({
          try: () => manager.respondToUserInput(threadId, requestId, answers),
          catch: (cause) => toRequestError(threadId, "user-input/respond", cause),
        });

      const stopSession: PiAdapterShape["stopSession"] = (threadId) =>
        Effect.tryPromise({
          try: () => manager.stopSession(threadId),
          catch: (cause) => toRequestError(threadId, "session/stop", cause),
        });

      const listSessions: PiAdapterShape["listSessions"] = () =>
        Effect.promise(() => manager.listSessions());

      const hasSession: PiAdapterShape["hasSession"] = (threadId) =>
        Effect.promise(() => manager.hasSession(threadId));

      const readThread: PiAdapterShape["readThread"] = (threadId) =>
        Effect.tryPromise({
          try: () => manager.readThread(threadId),
          catch: (cause) => toRequestError(threadId, "thread/read", cause),
        });

      const rollbackThread: PiAdapterShape["rollbackThread"] = (threadId, numTurns) =>
        Effect.tryPromise({
          try: () => manager.rollbackThread(threadId, numTurns),
          catch: (cause) => toRequestError(threadId, "thread/rollback", cause),
        });

      const stopAll: PiAdapterShape["stopAll"] = () =>
        Effect.tryPromise({
          try: () => manager.stopAll(),
          catch: (cause) => toRequestError("_global", "provider/stopAll", cause),
        });

      return {
        provider: PROVIDER,
        capabilities: {
          sessionModelSwitch: "in-session",
        },
        startSession,
        sendTurn,
        interruptTurn,
        respondToRequest,
        respondToUserInput,
        stopSession,
        listSessions,
        hasSession,
        readThread,
        rollbackThread,
        stopAll,
        streamEvents,
      } satisfies PiAdapterShape;
    }),
  );
