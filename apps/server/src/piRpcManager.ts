/**
 * PiRpcManager - Pi coding agent subprocess adapter.
 *
 * Manages one `pi --mode rpc` subprocess per provider session (thread). Translates
 * the pi JSONL RPC protocol into `ProviderRuntimeEvent` objects consumed by the
 * orchestration layer, and routes T3 Code provider commands back to pi over stdin.
 *
 * @module PiRpcManager
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  ApprovalRequestId,
  EventId,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ProviderTurnStartResult,
} from "@t3tools/contracts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PiStartSessionInput {
  readonly threadId: ThreadId;
  readonly provider?: "pi";
  readonly cwd?: string;
  readonly model?: string;
  readonly resumeCursor?: unknown;
  readonly providerOptions?: ProviderSessionStartInput["providerOptions"];
  readonly runtimeMode: ProviderSession["runtimeMode"];
}

export interface PiSendTurnInput {
  readonly threadId: ThreadId;
  readonly input?: string;
  readonly model?: string;
}

export interface PiThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}

export interface PiThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<PiThreadTurnSnapshot>;
}

export interface PiRpcManagerEvents {
  event: [event: ProviderRuntimeEvent];
}

interface PendingCommand {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
}

interface PendingUiRequest {
  readonly piRequestId: string;
  readonly method: "confirm" | "select";
  readonly approvalRequestId: ApprovalRequestId;
}

interface PiSessionContext {
  session: ProviderSession;
  child: ChildProcessWithoutNullStreams;
  currentTurnId: TurnId | undefined;
  turnInFlight: boolean;
  stopping: boolean;
  /** Correlates pi RPC command ids to pending promise callbacks. */
  pendingCommands: Map<string, PendingCommand>;
  /** Maps T3 Code approval request ids → pi extension_ui_request ids. */
  pendingUiRequests: Map<ApprovalRequestId, PendingUiRequest>;
  /** Reverse map: pi extension_ui_request id → T3 approval request id. */
  pendingUiRequestsByPiId: Map<string, ApprovalRequestId>;
  /** Raw accumulated text for the current assistant message. */
  assistantTextBuffer: string;
  /** Message id for the streaming assistant message in the current turn. */
  currentMessageItemId: RuntimeItemId | undefined;
  /** Latest model catalog returned by `get_available_models`. */
  availableModels: Array<{ modelId: string; name: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEventId(): EventId {
  return EventId.makeUnsafe(randomUUID());
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolvePiBinary(binaryPath?: string): string {
  return binaryPath ?? "pi";
}

/**
 * Resolve the pi provider (e.g. "anthropic", "openai") from a model slug.
 * Falls back to "anthropic" for unknown slugs since that is pi's primary use case.
 */
function resolvePiProviderForModel(model: string): string {
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) {
    return "openai";
  }
  if (model.startsWith("gemini-")) {
    return "google";
  }
  if (model.startsWith("claude-") || model.startsWith("anthropic/")) {
    return "anthropic";
  }
  return "anthropic";
}

function parsePiModelSpecifier(model: string | undefined): {
  provider: string | undefined;
  modelId: string | undefined;
  sessionModel: string | undefined;
} {
  const trimmed = model?.trim();
  if (!trimmed) {
    return { provider: undefined, modelId: undefined, sessionModel: undefined };
  }

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, slashIndex).trim();
    const modelId = trimmed.slice(slashIndex + 1).trim();
    if (provider && modelId) {
      return { provider, modelId, sessionModel: `${provider}/${modelId}` };
    }
  }

  return {
    provider: resolvePiProviderForModel(trimmed),
    modelId: trimmed,
    sessionModel: trimmed,
  };
}

/** Split buffer on LF only (JSONL spec). Returns [lines, remaining]. */
function splitJsonlLines(buffer: string): [string[], string] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === "\n") {
      let line = buffer.slice(start, i);
      // Strip optional trailing CR
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      if (line.trim().length > 0) {
        lines.push(line);
      }
      start = i + 1;
    }
  }
  return [lines, buffer.slice(start)];
}

// ── PiRpcManager ──────────────────────────────────────────────────────────────

export class PiRpcManager extends EventEmitter {
  private readonly sessions = new Map<ThreadId, PiSessionContext>();
  private readonly stateDir: string;

  constructor(stateDir: string) {
    super();
    this.stateDir = stateDir;
  }

  private sessionDirForThread(threadId: ThreadId): string {
    return join(this.stateDir, "pi-sessions", threadId);
  }

  private emitProviderEvent(event: ProviderRuntimeEvent): void {
    this.emit("event", event);
  }

  private sendCommand(
    ctx: PiSessionContext,
    command: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const id = randomUUID();
      ctx.pendingCommands.set(id, { resolve, reject });
      const line = JSON.stringify({ ...command, id }) + "\n";
      ctx.child.stdin.write(line);
    });
  }

  private sendCommandNoWait(ctx: PiSessionContext, command: Record<string, unknown>): void {
    const line = JSON.stringify(command) + "\n";
    ctx.child.stdin.write(line);
  }

  // ── Event translation ──────────────────────────────────────────────────────

  private handlePiEvent(ctx: PiSessionContext, raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const event = raw as Record<string, unknown>;
    const type = event["type"];

    // ── Command response ───────────────────────────────────────────────────
    if (type === "response") {
      const id = typeof event["id"] === "string" ? event["id"] : undefined;
      if (id) {
        const pending = ctx.pendingCommands.get(id);
        if (pending) {
          ctx.pendingCommands.delete(id);
          if (event["success"] === false) {
            pending.reject(new Error(String(event["error"] ?? "pi command failed")));
          } else {
            pending.resolve(event["data"] ?? null);
          }
        }
      }
      return;
    }

    const { session } = ctx;
    const threadId = session.threadId;
    const base = {
      eventId: makeEventId(),
      provider: "pi" as const,
      threadId,
      createdAt: nowIso(),
    };

    // ── agent_start ────────────────────────────────────────────────────────
    if (type === "agent_start") {
      ctx.turnInFlight = true;
      ctx.assistantTextBuffer = "";
      ctx.currentMessageItemId = undefined;
      return;
    }

    // ── agent_end ──────────────────────────────────────────────────────────
    if (type === "agent_end") {
      const turnId = ctx.currentTurnId;
      ctx.turnInFlight = false;

      // Flush any remaining text as a completed assistant message item
      if (ctx.assistantTextBuffer.length > 0 && ctx.currentMessageItemId) {
        this.emitProviderEvent({
          ...base,
          type: "item.completed",
          itemId: ctx.currentMessageItemId,
          turnId,
          payload: {
            itemType: "assistant_message",
            status: "completed",
            title: "Assistant",
          },
        });
      }
      ctx.assistantTextBuffer = "";
      ctx.currentMessageItemId = undefined;

      this.emitProviderEvent({
        ...base,
        type: "turn.completed",
        turnId,
        payload: {
          state: "completed",
          stopReason: "stop",
        },
      });
      this.emitProviderEvent({
        ...base,
        type: "session.state.changed",
        payload: { state: "ready" },
      });
      ctx.currentTurnId = undefined;
      return;
    }

    // ── message_start ──────────────────────────────────────────────────────
    if (type === "message_start") {
      const msg = event["message"] as Record<string, unknown> | undefined;
      if (!msg) return;
      if (msg["role"] !== "assistant") return;

      const itemId = RuntimeItemId.makeUnsafe(randomUUID());
      ctx.currentMessageItemId = itemId;
      ctx.assistantTextBuffer = "";

      this.emitProviderEvent({
        ...base,
        type: "item.started",
        itemId,
        turnId: ctx.currentTurnId,
        payload: {
          itemType: "assistant_message",
          status: "inProgress",
          title: "Assistant",
        },
      });
      return;
    }

    // ── message_update (streaming text/thinking deltas) ────────────────────
    if (type === "message_update") {
      const assistantEvent = event["assistantMessageEvent"] as
        | Record<string, unknown>
        | undefined;
      if (!assistantEvent) return;
      const deltaType = assistantEvent["type"];

      if (deltaType === "text_delta") {
        const delta = typeof assistantEvent["delta"] === "string" ? assistantEvent["delta"] : "";
        ctx.assistantTextBuffer += delta;
        this.emitProviderEvent({
          ...base,
          type: "content.delta",
          itemId: ctx.currentMessageItemId,
          turnId: ctx.currentTurnId,
          payload: {
            streamKind: "assistant_text",
            delta,
          },
        });
      } else if (deltaType === "thinking_delta") {
        const delta = typeof assistantEvent["delta"] === "string" ? assistantEvent["delta"] : "";
        this.emitProviderEvent({
          ...base,
          type: "content.delta",
          itemId: ctx.currentMessageItemId,
          turnId: ctx.currentTurnId,
          payload: {
            streamKind: "reasoning_text",
            delta,
          },
        });
      }
      return;
    }

    // ── message_end ────────────────────────────────────────────────────────
    if (type === "message_end") {
      const msg = event["message"] as Record<string, unknown> | undefined;
      if (!msg || msg["role"] !== "assistant") return;
      if (!ctx.currentMessageItemId) return;

      this.emitProviderEvent({
        ...base,
        type: "item.completed",
        itemId: ctx.currentMessageItemId,
        turnId: ctx.currentTurnId,
        payload: {
          itemType: "assistant_message",
          status: "completed",
          title: "Assistant",
        },
      });
      ctx.currentMessageItemId = undefined;
      ctx.assistantTextBuffer = "";
      return;
    }

    // ── tool_execution_start ───────────────────────────────────────────────
    if (type === "tool_execution_start") {
      const toolName = typeof event["toolName"] === "string" ? event["toolName"] : "tool";
      const toolCallId =
        typeof event["toolCallId"] === "string" ? event["toolCallId"] : randomUUID();
      const itemId = RuntimeItemId.makeUnsafe(toolCallId);
      const args = event["args"] as Record<string, unknown> | undefined;

      const itemType = toolName === "bash" ? "command_execution" : "dynamic_tool_call";
      const detail = args ? JSON.stringify(args).slice(0, 200) : undefined;

      this.emitProviderEvent({
        ...base,
        type: "item.started",
        itemId,
        turnId: ctx.currentTurnId,
        payload: {
          itemType,
          status: "inProgress",
          title: toolName,
          ...(detail ? { detail } : {}),
        },
      });
      return;
    }

    // ── tool_execution_update ──────────────────────────────────────────────
    if (type === "tool_execution_update") {
      const toolName = typeof event["toolName"] === "string" ? event["toolName"] : "tool";
      const toolCallId =
        typeof event["toolCallId"] === "string" ? event["toolCallId"] : randomUUID();
      const partial = event["partialResult"] as Record<string, unknown> | undefined;
      const content = Array.isArray(partial?.["content"]) ? partial["content"] : [];
      const textChunk = content
        .filter((c: unknown) => (c as Record<string, unknown>)["type"] === "text")
        .map((c: unknown) => (c as Record<string, unknown>)["text"] as string)
        .join("");

      if (textChunk) {
        this.emitProviderEvent({
          ...base,
          type: "tool.progress",
          itemId: RuntimeItemId.makeUnsafe(toolCallId),
          turnId: ctx.currentTurnId,
          payload: {
            toolName,
            summary: textChunk.slice(0, 300),
          },
        });
      }
      return;
    }

    // ── tool_execution_end ─────────────────────────────────────────────────
    if (type === "tool_execution_end") {
      const toolName = typeof event["toolName"] === "string" ? event["toolName"] : "tool";
      const toolCallId =
        typeof event["toolCallId"] === "string" ? event["toolCallId"] : randomUUID();
      const isError = event["isError"] === true;
      const result = event["result"] as Record<string, unknown> | undefined;
      const content = Array.isArray(result?.["content"]) ? result["content"] : [];
      const detail = content
        .filter((c: unknown) => (c as Record<string, unknown>)["type"] === "text")
        .map((c: unknown) => String((c as Record<string, unknown>)["text"] ?? ""))
        .join("")
        .slice(0, 300);

      this.emitProviderEvent({
        ...base,
        type: "item.completed",
        itemId: RuntimeItemId.makeUnsafe(toolCallId),
        turnId: ctx.currentTurnId,
        payload: {
          itemType: toolName === "bash" ? "command_execution" : "dynamic_tool_call",
          status: isError ? "failed" : "completed",
          title: toolName,
          ...(detail ? { detail } : {}),
        },
      });
      return;
    }

    // ── extension_ui_request (approval/confirmation dialogs) ──────────────
    if (type === "extension_ui_request") {
      const piRequestId = typeof event["id"] === "string" ? event["id"] : randomUUID();
      const method = event["method"] as string | undefined;

      if (method === "confirm" || method === "select") {
        const approvalRequestId = ApprovalRequestId.makeUnsafe(randomUUID());
        const requestType = method === "confirm" ? "command_execution_approval" : "command_execution_approval";
        const title = typeof event["title"] === "string" ? event["title"] : undefined;
        const options = Array.isArray(event["options"]) ? event["options"] : undefined;

        ctx.pendingUiRequests.set(approvalRequestId, {
          piRequestId,
          method,
          approvalRequestId,
        });
        ctx.pendingUiRequestsByPiId.set(piRequestId, approvalRequestId);

        const requestId = RuntimeRequestId.makeUnsafe(approvalRequestId);
        this.emitProviderEvent({
          ...base,
          type: "request.opened",
          requestId,
          turnId: ctx.currentTurnId,
          providerRefs: { providerRequestId: piRequestId },
          payload: {
            requestType,
            ...(title ? { detail: title } : {}),
            ...(options ? { args: { options } } : {}),
          },
        });
      } else if (method === "notify") {
        const message = typeof event["message"] === "string" ? event["message"] : "";
        const notifyType = event["notifyType"] as string | undefined;
        this.emitProviderEvent({
          ...base,
          type: "runtime.warning",
          payload: { message: `[pi] ${message}`, detail: notifyType },
        });
      }
      return;
    }

    // ── auto_compaction_start ──────────────────────────────────────────────
    if (type === "auto_compaction_start") {
      this.emitProviderEvent({
        ...base,
        type: "runtime.warning",
        payload: { message: "Pi context compaction started." },
      });
      return;
    }

    // ── auto_retry_start ───────────────────────────────────────────────────
    if (type === "auto_retry_start") {
      const attempt = typeof event["attempt"] === "number" ? event["attempt"] : 1;
      const errorMessage = typeof event["errorMessage"] === "string" ? event["errorMessage"] : "";
      this.emitProviderEvent({
        ...base,
        type: "runtime.warning",
        payload: { message: `Pi auto-retry (attempt ${attempt}): ${errorMessage}` },
      });
      return;
    }

    // ── auto_retry_end ─────────────────────────────────────────────────────
    if (type === "auto_retry_end") {
      if (event["success"] === false) {
        const finalError = typeof event["finalError"] === "string" ? event["finalError"] : "max retries exceeded";
        const turnId = ctx.currentTurnId;
        ctx.turnInFlight = false;
        this.emitProviderEvent({
          ...base,
          type: "turn.completed",
          turnId,
          payload: { state: "failed", errorMessage: finalError },
        });
        this.emitProviderEvent({
          ...base,
          type: "session.state.changed",
          payload: { state: "error", reason: finalError },
        });
      }
      return;
    }

    // ── extension_error ────────────────────────────────────────────────────
    if (type === "extension_error") {
      const error = typeof event["error"] === "string" ? event["error"] : "unknown extension error";
      this.emitProviderEvent({
        ...base,
        type: "runtime.error",
        payload: { message: `Pi extension error: ${error}`, class: "unknown" },
      });
      return;
    }
  }

  // ── Subprocess wiring ──────────────────────────────────────────────────────

  private attachSubprocess(ctx: PiSessionContext): void {
    const { child } = ctx;
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const threadId = ctx.session.threadId;
    const base = {
      eventId: makeEventId(),
      provider: "pi" as const,
      threadId,
      createdAt: nowIso(),
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const [lines, remaining] = splitJsonlLines(stdoutBuffer);
      stdoutBuffer = remaining;
      for (const line of lines) {
        try {
          const parsed: unknown = JSON.parse(line);
          this.handlePiEvent(ctx, parsed);
        } catch {
          // Non-JSON output from pi (startup banners etc.) — ignore
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrBuffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      // Drain lines
      const newline = stderrBuffer.lastIndexOf("\n");
      if (newline !== -1) {
        stderrBuffer = stderrBuffer.slice(newline + 1);
      }
    });

    child.on("exit", (code, signal) => {
      if (ctx.stopping) return;
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      const turnId = ctx.currentTurnId;

      // Reject any pending commands
      for (const [, pending] of ctx.pendingCommands) {
        pending.reject(new Error(`Pi process exited unexpectedly: ${reason}`));
      }
      ctx.pendingCommands.clear();

      if (ctx.turnInFlight) {
        ctx.turnInFlight = false;
        this.emitProviderEvent({
          ...base,
          type: "turn.completed",
          turnId,
          payload: { state: "failed", errorMessage: `Pi process exited: ${reason}` },
        });
      }

      this.emitProviderEvent({
        ...base,
        type: "session.exited",
        payload: { reason, recoverable: false, exitKind: "error" },
      });

      this.sessions.delete(ctx.session.threadId);
    });

    child.on("error", (err) => {
      for (const [, pending] of ctx.pendingCommands) {
        pending.reject(err);
      }
      ctx.pendingCommands.clear();

      this.emitProviderEvent({
        ...base,
        type: "runtime.error",
        payload: { message: `Pi process error: ${err.message}`, class: "transport_error" },
      });
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async startSession(input: PiStartSessionInput): Promise<ProviderSession> {
    const existing = this.sessions.get(input.threadId);
    if (existing && !existing.stopping) {
      return existing.session;
    }

    const piOptions = input.providerOptions?.pi;
    const binaryPath = resolvePiBinary(piOptions?.binaryPath);
    const sessionDir = this.sessionDirForThread(input.threadId);
    const hasExistingSession = existsSync(sessionDir);

    // Ensure session directory exists
    mkdirSync(sessionDir, { recursive: true });

    const parsedModel = parsePiModelSpecifier(input.model);
    const model = parsedModel.sessionModel;
    const piProvider = piOptions?.piProvider ?? parsedModel.provider;

    const args: string[] = [
      "--mode", "rpc",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--session-dir", sessionDir,
    ];

    if (piProvider) {
      args.push("--provider", piProvider);
    }
    if (parsedModel.modelId) {
      args.push("--model", parsedModel.modelId);
    }

    // Continue most recent session if one exists
    if (hasExistingSession) {
      args.push("-c");
    } else {
      args.push("--no-session");
    }

    const child = spawn(binaryPath, args, {
      cwd: input.cwd ?? process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const now = nowIso();
    const session: ProviderSession = {
      provider: "pi",
      status: "connecting",
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
      model,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      resumeCursor: { sessionDir, model, piProvider },
      createdAt: now,
      updatedAt: now,
    };

    const ctx: PiSessionContext = {
      session,
      child,
      currentTurnId: undefined,
      turnInFlight: false,
      stopping: false,
      pendingCommands: new Map(),
      pendingUiRequests: new Map(),
      pendingUiRequestsByPiId: new Map(),
      assistantTextBuffer: "",
      currentMessageItemId: undefined,
      availableModels: [],
    };

    this.sessions.set(input.threadId, ctx);
    this.attachSubprocess(ctx);

    const base = {
      eventId: makeEventId(),
      provider: "pi" as const,
      threadId: input.threadId,
      createdAt: now,
    };

    this.emitProviderEvent({
      ...base,
      type: "session.started",
      payload: { message: "pi session started", resume: input.resumeCursor },
    });
    this.emitProviderEvent({
      ...base,
      type: "thread.started",
      payload: {},
    });

    // Query available models so the UI can display them dynamically instead of
    // relying on the hardcoded fallback list in contracts/model.ts.
    try {
      const modelsData = (await this.sendCommand(ctx, { type: "get_available_models" })) as
        | { models?: Array<{ id?: string; name?: string; provider?: string }> }
        | null
        | undefined;

      const availableModels = Array.isArray(modelsData?.models)
        ? modelsData.models
            .filter((m) => typeof m.id === "string" && m.id.length > 0)
            .map((m) => {
              const rawModelId = m.id as string;
              const provider = typeof m.provider === "string" && m.provider.length > 0 ? m.provider : null;
              const modelId = provider ? `${provider}/${rawModelId}` : rawModelId;
              return {
                modelId,
                name:
                  typeof m.name === "string" && m.name.length > 0
                    ? m.name
                    : provider
                      ? `${rawModelId} (${provider})`
                      : rawModelId,
              };
            })
        : [];

      ctx.availableModels = availableModels;
      if (availableModels.length > 0) {
        this.emitProviderEvent({
          ...base,
          type: "session.configured",
          payload: {
            config: {
              ...(model ? { currentModelId: model } : {}),
              availableModels,
            },
          },
        });
      }
    } catch {
      // Non-fatal: the UI can still rely on explicit user selection or saved Pi models.
    }

    this.emitProviderEvent({
      ...base,
      type: "session.state.changed",
      payload: { state: "ready" },
    });

    ctx.session = { ...ctx.session, status: "ready", updatedAt: nowIso() };
    this.sessions.set(input.threadId, ctx);

    return ctx.session;
  }

  async sendTurn(input: PiSendTurnInput): Promise<ProviderTurnStartResult> {
    const ctx = this.sessions.get(input.threadId);
    if (!ctx || ctx.stopping) {
      throw new Error(`No active pi session for thread '${input.threadId}'`);
    }

    // Switch model if requested
    const parsedModel = parsePiModelSpecifier(input.model);
    if (parsedModel.sessionModel && parsedModel.sessionModel !== ctx.session.model) {
      await this.sendCommand(ctx, {
        type: "set_model",
        provider: parsedModel.provider ?? resolvePiProviderForModel(parsedModel.modelId ?? parsedModel.sessionModel),
        modelId: parsedModel.modelId ?? parsedModel.sessionModel,
      });
      ctx.session = { ...ctx.session, model: parsedModel.sessionModel, updatedAt: nowIso() };
      this.emitProviderEvent({
        eventId: makeEventId(),
        provider: "pi",
        threadId: input.threadId,
        createdAt: nowIso(),
        type: "session.configured",
        payload: {
          config: {
            currentModelId: parsedModel.sessionModel,
            availableModels: ctx.availableModels,
          },
        },
      });
    }

    const turnId = TurnId.makeUnsafe(randomUUID());
    ctx.currentTurnId = turnId;

    const base = {
      eventId: makeEventId(),
      provider: "pi" as const,
      threadId: input.threadId,
      createdAt: nowIso(),
    };
    this.emitProviderEvent({
      ...base,
      type: "turn.started",
      turnId,
      payload: {},
    });
    this.emitProviderEvent({
      ...base,
      type: "session.state.changed",
      payload: { state: "running" },
    });

    // Send the prompt asynchronously — pi streams events back
    this.sendCommandNoWait(ctx, {
      type: "prompt",
      message: input.input ?? "",
    });

    return {
      threadId: input.threadId,
      turnId,
      resumeCursor: ctx.session.resumeCursor,
    };
  }

  async interruptTurn(threadId: ThreadId, _turnId?: TurnId): Promise<void> {
    const ctx = this.sessions.get(threadId);
    if (!ctx || ctx.stopping) return;
    this.sendCommandNoWait(ctx, { type: "abort" });
  }

  async respondToRequest(
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ): Promise<void> {
    const ctx = this.sessions.get(threadId);
    if (!ctx || ctx.stopping) {
      throw new Error(`No active pi session for thread '${threadId}'`);
    }

    const pending = ctx.pendingUiRequests.get(requestId);
    if (!pending) {
      throw new Error(`Unknown pending approval request: ${requestId}`);
    }

    ctx.pendingUiRequests.delete(requestId);
    ctx.pendingUiRequestsByPiId.delete(pending.piRequestId);

    // Map T3 Code approval decision to pi extension_ui_response
    let responsePayload: Record<string, unknown>;
    if (pending.method === "confirm") {
      responsePayload = {
        type: "extension_ui_response",
        id: pending.piRequestId,
        confirmed: decision === "accept" || decision === "acceptForSession",
      };
    } else {
      // select: "accept" → first option (Allow), anything else → second option (Block)
      const value = decision === "accept" || decision === "acceptForSession" ? "Allow" : "Block";
      responsePayload = {
        type: "extension_ui_response",
        id: pending.piRequestId,
        value,
      };
    }

    const line = JSON.stringify(responsePayload) + "\n";
    ctx.child.stdin.write(line);
  }

  async respondToUserInput(): Promise<void> {
    // Pi does not natively support structured user-input questions in the same
    // way ACP providers do. No-op for now.
  }

  async stopSession(threadId: ThreadId): Promise<void> {
    const ctx = this.sessions.get(threadId);
    if (!ctx) return;
    ctx.stopping = true;
    this.sessions.delete(threadId);

    try {
      await this.sendCommand(ctx, { type: "abort" });
    } catch {
      // Best-effort abort
    }

    try {
      ctx.child.stdin.end();
      ctx.child.kill("SIGTERM");
    } catch {
      // Process may already be dead
    }
  }

  async listSessions(): Promise<ProviderSession[]> {
    return Array.from(this.sessions.values())
      .filter((ctx) => !ctx.stopping)
      .map((ctx) => ctx.session);
  }

  async hasSession(threadId: ThreadId): Promise<boolean> {
    const ctx = this.sessions.get(threadId);
    return ctx !== undefined && !ctx.stopping;
  }

  async readThread(threadId: ThreadId): Promise<PiThreadSnapshot> {
    // Pi session history is managed internally by pi. We return a minimal snapshot.
    return { threadId, turns: [] };
  }

  async rollbackThread(threadId: ThreadId, _numTurns: number): Promise<PiThreadSnapshot> {
    const ctx = this.sessions.get(threadId);
    if (ctx && !ctx.stopping) {
      // Start a new pi session to drop conversation context.
      // T3 Code's git checkpointing handles the actual file rollback.
      try {
        await this.sendCommand(ctx, { type: "new_session" });
      } catch {
        // If new_session fails, the subprocess may have exited; that's fine.
      }
    }
    return { threadId, turns: [] };
  }

  async stopAll(): Promise<void> {
    const threadIds = Array.from(this.sessions.keys());
    await Promise.allSettled(threadIds.map((id) => this.stopSession(id)));
  }
}
