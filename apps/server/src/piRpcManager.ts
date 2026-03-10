import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  ApprovalRequestId,
  EventId,
  type ProviderApprovalDecision,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ChatAttachment,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
  type ProviderTurnStartResult,
} from "@t3tools/contracts";

import { resolveAttachmentPath } from "./attachmentStore.ts";
import {
  encodePiModelSlug,
  parseAvailablePiModels,
  resolvePiBinaryPath,
  type PiAvailableModel,
} from "./piModels.ts";

type PiRpcResponse = {
  readonly id?: string;
  readonly type: "response";
  readonly command: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
};

type PendingRpcRequest = {
  readonly resolve: (response: PiRpcResponse) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

type PendingPiUserInputRequest = {
  readonly response: (answers: Record<string, unknown>) => Record<string, unknown>;
};

type PiToolExecutionState = {
  readonly itemId: ReturnType<typeof RuntimeItemId.makeUnsafe>;
  readonly itemType: "command_execution" | "file_change" | "dynamic_tool_call";
  readonly title: string;
  readonly detail?: string;
  lastOutput: string;
};

type PiReasoningState = {
  readonly itemId: ReturnType<typeof RuntimeItemId.makeUnsafe>;
  text: string;
};

interface PiSessionContext {
  session: ProviderSession;
  readonly child: ChildProcessWithoutNullStreams;
  readonly sessionFile: string;
  pendingRequests: Map<string, PendingRpcRequest>;
  pendingUserInputs: Map<ApprovalRequestId, PendingPiUserInputRequest>;
  toolExecutions: Map<string, PiToolExecutionState>;
  currentTurnId: TurnId | undefined;
  stopping: boolean;
  lineBuffer: string;
  lastStderrLine: string | undefined;
  availableModels: ReadonlyArray<PiAvailableModel>;
  currentModel: string | undefined;
  thinkingLevel: string | undefined;
  assistantItemId: ReturnType<typeof RuntimeItemId.makeUnsafe> | undefined;
  assistantText: string;
  reasoningByIndex: Map<number, PiReasoningState>;
}

export interface PiRpcManagerEvents {
  event: [event: ProviderRuntimeEvent];
}

export interface PiRpcManagerStartSessionInput {
  readonly threadId: ThreadId;
  readonly provider?: "pi";
  readonly cwd?: string;
  readonly model?: string;
  readonly resumeCursor?: unknown;
  readonly providerOptions?: ProviderSessionStartInput["providerOptions"];
  readonly runtimeMode: ProviderSession["runtimeMode"];
}

export interface PiThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}

export interface PiThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<PiThreadTurnSnapshot>;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function toSafeThreadSegment(threadId: string): string {
  const normalized = threadId.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.length > 0 ? normalized : "thread";
}

function readResumeSessionFile(input: { readonly resumeCursor?: unknown }): string | undefined {
  const resumeCursor = asObject(input.resumeCursor);
  const sessionFile = asString(resumeCursor?.sessionFile);
  return sessionFile?.trim() ? sessionFile.trim() : undefined;
}

function mapPiToolNameToItemType(
  toolName: string | undefined,
): "command_execution" | "file_change" | "dynamic_tool_call" {
  switch (toolName?.trim().toLowerCase()) {
    case "bash":
    case "exec":
    case "execute":
      return "command_execution";
    case "write":
    case "edit":
    case "delete":
    case "move":
    case "rename":
    case "patch":
      return "file_change";
    default:
      return "dynamic_tool_call";
  }
}

function mapStreamKindForToolItemType(itemType: PiToolExecutionState["itemType"]) {
  switch (itemType) {
    case "command_execution":
      return "command_output" as const;
    case "file_change":
      return "file_change_output" as const;
    default:
      return "unknown" as const;
  }
}

function buildToolDetail(toolName: string | undefined, args: Record<string, unknown> | undefined) {
  if (!toolName || !args) {
    return undefined;
  }
  const command = asString(args.command);
  if (command?.trim()) {
    return command.trim();
  }
  const targetPath = asString(args.path);
  if (targetPath?.trim()) {
    return targetPath.trim();
  }
  const query = asString(args.query);
  if (query?.trim()) {
    return query.trim();
  }
  return undefined;
}

function extractToolOutputText(value: unknown): string {
  const record = asObject(value);
  const content = Array.isArray(record?.content) ? record.content : [];
  return content
    .map((entry) => {
      const block = asObject(entry);
      if (block?.type !== "text") {
        return "";
      }
      return asString(block.text) ?? "";
    })
    .join("");
}

function extractAssistantContent(message: Record<string, unknown>, contentType: "text" | "thinking"): string {
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .map((entry) => {
      const block = asObject(entry);
      if (!block || block.type !== contentType) {
        return "";
      }
      return asString(block.text) ?? "";
    })
    .join("");
}

function decodePiModelSelection(
  selection: string | undefined,
  availableModels: ReadonlyArray<PiAvailableModel>,
): { readonly provider: string; readonly modelId: string; readonly slug: string } | undefined {
  const trimmed = selection?.trim();
  if (!trimmed || trimmed === "auto") {
    return undefined;
  }

  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    return {
      provider: trimmed.slice(0, slashIndex),
      modelId: trimmed.slice(slashIndex + 1),
      slug: trimmed,
    };
  }

  const matches = availableModels.filter(
    (candidate) => candidate.modelId === trimmed || candidate.slug === trimmed,
  );
  if (matches.length === 1) {
    const match = matches[0]!;
    return {
      provider: match.provider,
      modelId: match.modelId,
      slug: match.slug,
    };
  }

  throw new Error(
    `Pi model '${trimmed}' is ambiguous. Use the provider-qualified form 'provider/model-id'.`,
  );
}

/**
 * On Windows with `shell: true`, `child.kill()` only terminates the `cmd.exe`
 * wrapper, leaving the actual command running. Use `taskkill /T` to kill the
 * entire process tree instead.
 */
function killChildTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to direct kill.
    }
  }
  child.kill();
}

export class PiRpcManager extends EventEmitter<PiRpcManagerEvents> {
  private readonly sessions = new Map<ThreadId, PiSessionContext>();

  constructor(
    private readonly sessionsRoot: string,
    private readonly stateDir: string,
  ) {
    super();
  }

  private emitRuntimeEvent(event: ProviderRuntimeEvent) {
    this.emit("event", event);
  }

  private createEventBase(context: PiSessionContext) {
    return {
      eventId: EventId.makeUnsafe(randomUUID()),
      provider: "pi" as const,
      threadId: context.session.threadId,
      createdAt: new Date().toISOString(),
    };
  }

  private updateSession(context: PiSessionContext, patch: Partial<ProviderSession>): ProviderSession {
    context.session = {
      ...context.session,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return context.session;
  }

  private clearStreamingState(context: PiSessionContext) {
    context.assistantItemId = undefined;
    context.assistantText = "";
    context.reasoningByIndex.clear();
    context.toolExecutions.clear();
  }

  private emitSessionStarted(context: PiSessionContext, sessionId: string | undefined) {
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      type: "session.started",
      payload: {
        message: "Connected to Pi RPC mode.",
        resume: context.session.resumeCursor,
      },
    });
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      type: "thread.started",
      payload: sessionId ? { providerThreadId: sessionId } : {},
    });
    this.emitSessionConfigured(context);
  }

  private emitSessionConfigured(context: PiSessionContext) {
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      type: "session.configured",
      payload: {
        config: {
          currentModelId: context.currentModel ?? null,
          availableModels: context.availableModels.map((model) => ({
            modelId: model.slug,
            name: model.name,
          })),
          ...(context.thinkingLevel ? { thinkingLevel: context.thinkingLevel } : {}),
        },
      },
    });
  }

  private emitSessionExit(
    context: PiSessionContext,
    input: {
      readonly reason?: string;
      readonly exitKind: "graceful" | "error";
      readonly recoverable?: boolean;
    },
  ) {
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      type: "session.exited",
      payload: {
        ...(input.reason ? { reason: input.reason } : {}),
        exitKind: input.exitKind,
        recoverable: input.recoverable ?? false,
      },
    });
  }

  private emitRuntimeError(context: PiSessionContext, message: string, turnId?: TurnId) {
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(turnId ? { turnId } : {}),
      type: "runtime.error",
      payload: {
        message,
      },
    });
  }

  private ensureAssistantItem(context: PiSessionContext) {
    if (!context.assistantItemId) {
      context.assistantItemId = RuntimeItemId.makeUnsafe(randomUUID());
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
        itemId: context.assistantItemId,
        type: "item.started",
        payload: {
          itemType: "assistant_message",
          status: "inProgress",
          title: "Assistant response",
        },
      });
    }

    return context.assistantItemId;
  }

  private ensureReasoningItem(context: PiSessionContext, contentIndex: number) {
    const existing = context.reasoningByIndex.get(contentIndex);
    if (existing) {
      return existing;
    }

    const next: PiReasoningState = {
      itemId: RuntimeItemId.makeUnsafe(randomUUID()),
      text: "",
    };
    context.reasoningByIndex.set(contentIndex, next);
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      itemId: next.itemId,
      type: "item.started",
      payload: {
        itemType: "reasoning",
        status: "inProgress",
        title: "Reasoning",
      },
    });
    return next;
  }

  private emitRemainingAssistantDelta(context: PiSessionContext, fullText: string) {
    if (!fullText || fullText === context.assistantText) {
      return;
    }
    const itemId = this.ensureAssistantItem(context);
    const delta = fullText.startsWith(context.assistantText)
      ? fullText.slice(context.assistantText.length)
      : fullText;
    if (!delta) {
      return;
    }
    context.assistantText = fullText;
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      itemId,
      type: "content.delta",
      payload: {
        delta,
        streamKind: "assistant_text",
      },
    });
  }

  private emitRemainingReasoningDelta(
    context: PiSessionContext,
    contentIndex: number,
    fullText: string,
  ) {
    const reasoning = this.ensureReasoningItem(context, contentIndex);
    if (!fullText || fullText === reasoning.text) {
      return;
    }
    const delta = fullText.startsWith(reasoning.text) ? fullText.slice(reasoning.text.length) : fullText;
    if (!delta) {
      return;
    }
    reasoning.text = fullText;
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      itemId: reasoning.itemId,
      type: "content.delta",
      payload: {
        delta,
        streamKind: "reasoning_text",
        contentIndex,
      },
    });
  }

  private resolvePendingRequests(context: PiSessionContext, message: string) {
    for (const pending of context.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    context.pendingRequests.clear();
  }

  private resolvePendingUserInputsAsCancelled(context: PiSessionContext) {
    for (const requestId of context.pendingUserInputs.keys()) {
      this.writeCommand(context, {
        type: "extension_ui_response",
        id: requestId,
        cancelled: true,
      });
    }
    context.pendingUserInputs.clear();
  }

  private attachProcessListeners(context: PiSessionContext) {
    context.child.stdout.setEncoding("utf8");
    context.child.stdout.on("data", (chunk: string) => {
      context.lineBuffer += chunk;

      while (true) {
        const newlineIndex = context.lineBuffer.indexOf("\n");
        if (newlineIndex === -1) {
          return;
        }

        const rawLine = context.lineBuffer.slice(0, newlineIndex);
        context.lineBuffer = context.lineBuffer.slice(newlineIndex + 1);
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (line.length === 0) {
          continue;
        }

        this.handleLine(context, line);
      }
    });

    context.child.stderr.setEncoding("utf8");
    context.child.stderr.on("data", (chunk: string) => {
      const trimmed = chunk.trim();
      if (trimmed.length > 0) {
        context.lastStderrLine = trimmed.split("\n").at(-1)?.trim() ?? trimmed;
      }
    });

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (!this.sessions.has(context.session.threadId)) {
        return;
      }

      this.resolvePendingRequests(
        context,
        context.lastStderrLine ??
          (signal ? `Pi exited from signal ${signal}.` : undefined) ??
          (code !== null ? `Pi exited with code ${code}.` : undefined) ??
          "Pi exited unexpectedly.",
      );
      context.pendingUserInputs.clear();

      this.updateSession(context, {
        status: "closed",
        activeTurnId: undefined,
      });

      if (!context.stopping) {
        const reason =
          context.lastStderrLine ??
          (signal ? `Pi exited from signal ${signal}.` : undefined) ??
          (code !== null ? `Pi exited with code ${code}.` : "Pi exited unexpectedly.");
        this.emitSessionExit(context, {
          reason,
          exitKind: code === 0 ? "graceful" : "error",
          recoverable: true,
        });
        if (context.currentTurnId && code !== 0) {
          this.emitRuntimeError(context, reason, context.currentTurnId);
        }
      }

      this.sessions.delete(context.session.threadId);
    };

    context.child.once("exit", onExit);
  }

  private handleLine(context: PiSessionContext, line: string) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    if (payload.type === "response") {
      const response = payload as unknown as PiRpcResponse;
      if (response.id) {
        const pending = context.pendingRequests.get(response.id);
        if (pending) {
          clearTimeout(pending.timer);
          context.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      }
      return;
    }

    this.handleEvent(context, payload);
  }

  private handleEvent(context: PiSessionContext, event: Record<string, unknown>) {
    switch (event.type) {
      case "message_update":
        this.handleMessageUpdate(context, event);
        return;
      case "message_end":
        this.handleMessageEnd(context, event);
        return;
      case "tool_execution_start":
        this.handleToolExecutionStart(context, event);
        return;
      case "tool_execution_update":
        this.handleToolExecutionUpdate(context, event);
        return;
      case "tool_execution_end":
        this.handleToolExecutionEnd(context, event);
        return;
      case "turn_end":
        this.handleTurnEnd(context, event);
        return;
      case "extension_error": {
        const errorMessage = asString(event.error)?.trim();
        if (errorMessage) {
          this.emitRuntimeError(context, errorMessage, context.currentTurnId);
        }
        return;
      }
      case "extension_ui_request":
        this.handleExtensionUiRequest(context, event);
        return;
      case "auto_retry_start": {
        const detail = asString(event.errorMessage)?.trim();
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
          type: "runtime.warning",
          payload: {
            message: "Pi auto-retry started.",
            ...(detail ? { detail } : {}),
          },
        });
        return;
      }
      default:
        return;
    }
  }

  private handleMessageUpdate(context: PiSessionContext, event: Record<string, unknown>) {
    const update = asObject(event.assistantMessageEvent);
    if (!update) {
      return;
    }
    const updateType = asString(update?.type);
    if (!updateType) {
      return;
    }

    switch (updateType) {
      case "text_start":
        this.ensureAssistantItem(context);
        return;
      case "text_delta": {
        const delta = asString(update.delta) ?? "";
        if (!delta) {
          return;
        }
        const itemId = this.ensureAssistantItem(context);
        context.assistantText += delta;
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
          itemId,
          type: "content.delta",
          payload: {
            delta,
            streamKind: "assistant_text",
            ...(typeof update.contentIndex === "number" ? { contentIndex: update.contentIndex } : {}),
          },
        });
        return;
      }
      case "thinking_start":
        this.ensureReasoningItem(context, typeof update.contentIndex === "number" ? update.contentIndex : 0);
        return;
      case "thinking_delta": {
        const contentIndex = typeof update.contentIndex === "number" ? update.contentIndex : 0;
        const delta = asString(update.delta) ?? "";
        if (!delta) {
          return;
        }
        const reasoning = this.ensureReasoningItem(context, contentIndex);
        reasoning.text += delta;
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
          itemId: reasoning.itemId,
          type: "content.delta",
          payload: {
            delta,
            streamKind: "reasoning_text",
            contentIndex,
          },
        });
        return;
      }
      default:
        return;
    }
  }

  private handleMessageEnd(context: PiSessionContext, event: Record<string, unknown>) {
    const message = asObject(event.message);
    if (!message || asString(message.role) !== "assistant") {
      return;
    }

    const finalModel = encodePiModelSlug(asString(message.provider), asString(message.model));
    if (finalModel) {
      context.currentModel = finalModel;
      this.updateSession(context, { model: finalModel });
    }

    this.emitRemainingAssistantDelta(context, extractAssistantContent(message, "text"));
    const reasoningText = extractAssistantContent(message, "thinking");
    if (reasoningText) {
      this.emitRemainingReasoningDelta(context, 0, reasoningText);
    }

    if (context.assistantItemId) {
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
        itemId: context.assistantItemId,
        type: "item.completed",
        payload: {
          itemType: "assistant_message",
          status: asString(message.stopReason) === "error" ? "failed" : "completed",
          title: "Assistant response",
          data: { message },
        },
      });
      context.assistantItemId = undefined;
    }

    for (const reasoning of context.reasoningByIndex.values()) {
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
        itemId: reasoning.itemId,
        type: "item.completed",
        payload: {
          itemType: "reasoning",
          status: "completed",
          title: "Reasoning",
        },
      });
    }
    context.reasoningByIndex.clear();
  }

  private handleToolExecutionStart(context: PiSessionContext, event: Record<string, unknown>) {
    const toolCallId = asString(event.toolCallId)?.trim();
    if (!toolCallId) {
      return;
    }

    const toolName = asString(event.toolName)?.trim() || "Tool";
    const args = asObject(event.args);
    const detail = buildToolDetail(toolName, args);
    const itemType = mapPiToolNameToItemType(toolName);
    const itemId = RuntimeItemId.makeUnsafe(toolCallId);
    context.toolExecutions.set(toolCallId, {
      itemId,
      itemType,
      title: toolName,
      ...(detail ? { detail } : {}),
      lastOutput: "",
    });

    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      itemId,
      type: "item.started",
      payload: {
        itemType,
        status: "inProgress",
        title: toolName,
        ...(detail ? { detail } : {}),
        ...(args ? { data: { args } } : {}),
      },
    });
  }

  private handleToolExecutionUpdate(context: PiSessionContext, event: Record<string, unknown>) {
    const toolCallId = asString(event.toolCallId)?.trim();
    if (!toolCallId) {
      return;
    }
    const state = context.toolExecutions.get(toolCallId);
    if (!state) {
      return;
    }

    const nextOutput = extractToolOutputText(event.partialResult);
    const delta = nextOutput.startsWith(state.lastOutput)
      ? nextOutput.slice(state.lastOutput.length)
      : nextOutput;
    state.lastOutput = nextOutput;

    if (delta) {
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
        itemId: state.itemId,
        type: "content.delta",
        payload: {
          delta,
          streamKind: mapStreamKindForToolItemType(state.itemType),
        },
      });
    }

    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      itemId: state.itemId,
      type: "item.updated",
      payload: {
        itemType: state.itemType,
        status: "inProgress",
        title: state.title,
        ...(state.detail ? { detail: state.detail } : {}),
      },
    });
  }

  private handleToolExecutionEnd(context: PiSessionContext, event: Record<string, unknown>) {
    const toolCallId = asString(event.toolCallId)?.trim();
    if (!toolCallId) {
      return;
    }
    const state = context.toolExecutions.get(toolCallId);
    if (!state) {
      return;
    }

    const nextOutput = extractToolOutputText(event.result);
    const delta = nextOutput.startsWith(state.lastOutput)
      ? nextOutput.slice(state.lastOutput.length)
      : nextOutput;
    if (delta) {
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
        itemId: state.itemId,
        type: "content.delta",
        payload: {
          delta,
          streamKind: mapStreamKindForToolItemType(state.itemType),
        },
      });
    }

    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      itemId: state.itemId,
      type: "item.completed",
      payload: {
        itemType: state.itemType,
        status: event.isError === true ? "failed" : "completed",
        title: state.title,
        ...(state.detail ? { detail: state.detail } : {}),
        data: {
          ...(asObject(event.args) ? { args: asObject(event.args) } : {}),
          ...(asObject(event.result) ? { result: event.result } : {}),
        },
      },
    });

    context.toolExecutions.delete(toolCallId);
  }

  private handleTurnEnd(context: PiSessionContext, event: Record<string, unknown>) {
    const turnId = context.currentTurnId;
    const message = asObject(event.message);
    const usage = message ? asObject(message.usage) : undefined;
    const stopReason = message ? asString(message.stopReason) : undefined;
    const errorMessage = message ? asString(message.errorMessage) : undefined;
    const finalModel = message
      ? encodePiModelSlug(asString(message.provider), asString(message.model))
      : undefined;

    if (finalModel) {
      context.currentModel = finalModel;
    }

    if (usage) {
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(turnId ? { turnId } : {}),
        type: "thread.token-usage.updated",
        payload: {
          usage,
        },
      });
    }

    if (stopReason === "aborted") {
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(turnId ? { turnId } : {}),
        type: "turn.aborted",
        payload: {
          reason: "Pi turn aborted.",
        },
      });
      this.updateSession(context, {
        status: "ready",
        activeTurnId: undefined,
      });
    } else {
      const failed = stopReason === "error" || Boolean(errorMessage);
      this.emitRuntimeEvent({
        ...this.createEventBase(context),
        ...(turnId ? { turnId } : {}),
        type: "turn.completed",
        payload: {
          state: failed ? "failed" : "completed",
          ...(stopReason !== undefined ? { stopReason } : {}),
          ...(usage ? { usage } : {}),
          ...(context.currentModel ? { modelUsage: { currentModelId: context.currentModel } } : {}),
          ...(errorMessage ? { errorMessage } : {}),
        },
      });

      this.updateSession(context, {
        status: failed ? "error" : "ready",
        activeTurnId: undefined,
        ...(context.currentModel ? { model: context.currentModel } : {}),
        ...(failed && errorMessage ? { lastError: errorMessage } : {}),
      });

      if (failed && errorMessage) {
        this.emitRuntimeError(context, errorMessage, turnId);
      }
    }

    context.currentTurnId = undefined;
    this.clearStreamingState(context);
  }

  private handleExtensionUiRequest(context: PiSessionContext, event: Record<string, unknown>) {
    const rawRequestId = asString(event.id)?.trim();
    const method = asString(event.method)?.trim();
    if (!rawRequestId || !method) {
      return;
    }
    const requestId = ApprovalRequestId.makeUnsafe(rawRequestId);

    const title = asString(event.title)?.trim() || "Pi input";
    switch (method) {
      case "select": {
        const options = asStringArray(event.options);
        if (options.length === 0) {
          return;
        }
        context.pendingUserInputs.set(requestId, {
          response: (answers) => ({
            type: "extension_ui_response",
            id: requestId,
            value: asString(answers.value) ?? options[0]!,
          }),
        });
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
          requestId: RuntimeRequestId.makeUnsafe(requestId),
          type: "user-input.requested",
          payload: {
            questions: [
              {
                id: "value",
                header: title,
                question: title,
                options: options.map((option) => ({
                  label: option,
                  description: option,
                })),
              },
            ],
          },
        });
        return;
      }

      case "confirm": {
        const message = asString(event.message)?.trim() || title;
        context.pendingUserInputs.set(requestId, {
          response: (answers) => {
            const value = asString(answers.confirmed)?.toLowerCase() ?? "";
            return {
              type: "extension_ui_response",
              id: requestId,
              confirmed: value === "yes" || value === "confirm" || value === "true",
            };
          },
        });
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
          requestId: RuntimeRequestId.makeUnsafe(requestId),
          type: "user-input.requested",
          payload: {
            questions: [
              {
                id: "confirmed",
                header: title,
                question: message,
                options: [
                  {
                    label: "Yes",
                    description: "Confirm and continue.",
                  },
                  {
                    label: "No",
                    description: "Decline and cancel.",
                  },
                ],
              },
            ],
          },
        });
        return;
      }

      case "input":
      case "editor": {
        context.pendingUserInputs.set(requestId, {
          response: (answers) => ({
            type: "extension_ui_response",
            id: requestId,
            value: asString(answers.value) ?? "",
          }),
        });
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
          requestId: RuntimeRequestId.makeUnsafe(requestId),
          type: "user-input.requested",
          payload: {
            questions: [
              {
                id: "value",
                header: title,
                question: title,
                options: [
                  {
                    label: method === "editor" ? "Submit editor text" : "Submit text",
                    description: "Enter a custom response in the composer.",
                  },
                ],
              },
            ],
          },
        });
        return;
      }

      case "notify": {
        const message = asString(event.message)?.trim();
        if (!message) {
          return;
        }
        const notifyType = asString(event.notifyType);
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
          type: notifyType === "error" ? "runtime.error" : "runtime.warning",
          payload:
            notifyType === "error"
              ? { message }
              : {
                  message,
                },
        });
        return;
      }

      default:
        return;
    }
  }

  private writeCommand(context: PiSessionContext, command: Record<string, unknown>) {
    const payload = `${JSON.stringify(command)}\n`;
    if (!context.child.stdin.writable) {
      throw new Error("Cannot write to Pi RPC stdin.");
    }
    context.child.stdin.write(payload);
  }

  private async sendCommand(context: PiSessionContext, command: Record<string, unknown>) {
    const id = randomUUID();
    const response = await new Promise<PiRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        context.pendingRequests.delete(id);
        reject(new Error(`Pi RPC command '${String(command.type)}' timed out.`));
      }, 30_000);
      context.pendingRequests.set(id, { resolve, reject, timer });
      this.writeCommand(context, { ...command, id });
    });

    if (!response.success) {
      throw new Error(response.error ?? `Pi RPC command '${response.command}' failed.`);
    }
    return response;
  }

  private async getState(context: PiSessionContext): Promise<Record<string, unknown>> {
    const response = await this.sendCommand(context, { type: "get_state" });
    return asObject(response.data) ?? {};
  }

  private async refreshAvailableModels(context: PiSessionContext) {
    const response = await this.sendCommand(context, { type: "get_available_models" });
    context.availableModels = parseAvailablePiModels(response.data);
  }

  private async setSessionModel(context: PiSessionContext, selection: string) {
    const resolved = decodePiModelSelection(selection, context.availableModels);
    if (!resolved) {
      return;
    }

    await this.sendCommand(context, {
      type: "set_model",
      provider: resolved.provider,
      modelId: resolved.modelId,
    });
    context.currentModel = resolved.slug;
    this.updateSession(context, { model: resolved.slug });
  }

  private materializeImages(
    attachments: ReadonlyArray<ChatAttachment>,
  ): ReadonlyArray<{ type: "image"; data: string; mimeType: string }> {
    return attachments.map((attachment) => {
      const filePath = resolveAttachmentPath({
        stateDir: this.stateDir,
        attachment,
      });
      if (!filePath || !existsSync(filePath)) {
        throw new Error(`Attachment '${attachment.id}' could not be resolved for Pi.`);
      }
      return {
        type: "image" as const,
        data: readFileSync(filePath).toString("base64"),
        mimeType: attachment.mimeType,
      };
    });
  }

  private requireSession(threadId: ThreadId): PiSessionContext {
    const context = this.sessions.get(threadId);
    if (!context) {
      throw new Error(`Unknown Pi session: ${threadId}`);
    }
    if (context.session.status === "closed") {
      throw new Error(`Pi session is closed: ${threadId}`);
    }
    return context;
  }

  async startSession(input: PiRpcManagerStartSessionInput): Promise<ProviderSession> {
    const resolvedCwd = input.cwd ?? process.cwd();
    const sessionFile =
      readResumeSessionFile(input) ??
      path.join(this.sessionsRoot, toSafeThreadSegment(input.threadId), "session.jsonl");
    mkdirSync(path.dirname(sessionFile), { recursive: true });

    const now = new Date().toISOString();
    const session: ProviderSession = {
      provider: "pi",
      status: "connecting",
      runtimeMode: input.runtimeMode,
      ...(input.model ? { model: input.model } : {}),
      cwd: resolvedCwd,
      threadId: input.threadId,
      resumeCursor: { sessionFile },
      createdAt: now,
      updatedAt: now,
    };

    const binaryPath = resolvePiBinaryPath(input.providerOptions?.pi?.binaryPath);
    const child = spawn(
      binaryPath,
      ["--mode", "rpc", "--session-dir", path.dirname(sessionFile), "--session", sessionFile],
      {
        cwd: resolvedCwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );

    const context: PiSessionContext = {
      session,
      child,
      sessionFile,
      pendingRequests: new Map(),
      pendingUserInputs: new Map(),
      toolExecutions: new Map(),
      currentTurnId: undefined,
      stopping: false,
      lineBuffer: "",
      lastStderrLine: undefined,
      availableModels: [],
      currentModel: undefined,
      thinkingLevel: undefined,
      assistantItemId: undefined,
      assistantText: "",
      reasoningByIndex: new Map(),
    };
    this.sessions.set(input.threadId, context);
    this.attachProcessListeners(context);

    try {
      await this.sendCommand(context, { type: "set_auto_retry", enabled: false });
      await this.refreshAvailableModels(context);

      if (input.model?.trim() && input.model.trim() !== "auto") {
        await this.setSessionModel(context, input.model);
      }

      const state = await this.getState(context);
      const stateModel = asObject(state.model);
      const currentModel =
        context.currentModel ??
        encodePiModelSlug(asString(stateModel?.provider), asString(stateModel?.id)) ??
        input.model;
      const sessionId = asString(state.sessionId)?.trim();
      const thinkingLevel = asString(state.thinkingLevel)?.trim();

      context.currentModel = currentModel;
      context.thinkingLevel = thinkingLevel;
      this.updateSession(context, {
        status: "ready",
        ...(currentModel ? { model: currentModel } : {}),
        resumeCursor: {
          sessionFile,
          ...(sessionId ? { sessionId } : {}),
        },
      });

      this.emitSessionStarted(context, sessionId);
      if (input.runtimeMode !== "full-access") {
        this.emitRuntimeEvent({
          ...this.createEventBase(context),
          type: "runtime.warning",
          payload: {
            message: "Pi does not provide approval-mode prompts in T3 Code.",
            detail: "Pi sessions currently run with Pi's native tool behavior regardless of runtime mode.",
          },
        });
      }
      return { ...context.session };
    } catch (error) {
      const message = toMessage(error, "Failed to start Pi session.");
      this.updateSession(context, {
        status: "error",
        lastError: message,
      });
      this.emitRuntimeError(context, message);
      context.stopping = true;
      this.resolvePendingRequests(context, message);
      this.resolvePendingUserInputsAsCancelled(context);
      killChildTree(context.child);
      this.sessions.delete(input.threadId);
      throw new Error(message, { cause: error });
    }
  }

  async sendTurn(input: {
    readonly threadId: ThreadId;
    readonly input?: string;
    readonly attachments?: ReadonlyArray<ChatAttachment>;
    readonly model?: string;
  }): Promise<ProviderTurnStartResult> {
    const context = this.requireSession(input.threadId);
    const promptText = input.input?.trim() ?? "";
    const images = this.materializeImages(input.attachments ?? []);
    if (!promptText && images.length === 0) {
      throw new Error("Pi turns require text, image attachments, or both.");
    }
    if (context.currentTurnId) {
      throw new Error("Pi already has an active turn for this thread.");
    }

    if (input.model?.trim() && input.model.trim() !== context.currentModel) {
      await this.setSessionModel(context, input.model);
      this.emitSessionConfigured(context);
    }

    const turnId = TurnId.makeUnsafe(randomUUID());
    context.currentTurnId = turnId;
    this.clearStreamingState(context);
    this.updateSession(context, {
      status: "running",
      activeTurnId: turnId,
      ...(context.currentModel ? { model: context.currentModel } : {}),
    });

    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      turnId,
      type: "turn.started",
      payload: {
        ...(context.currentModel ? { model: context.currentModel } : {}),
        ...(context.thinkingLevel ? { effort: context.thinkingLevel } : {}),
      },
    });

    await this.sendCommand(context, {
      type: "prompt",
      message: promptText,
      ...(images.length > 0 ? { images } : {}),
    });

    return {
      threadId: context.session.threadId,
      turnId,
      ...(context.session.resumeCursor !== undefined ? { resumeCursor: context.session.resumeCursor } : {}),
    };
  }

  async interruptTurn(threadId: ThreadId, turnId?: TurnId): Promise<void> {
    const context = this.requireSession(threadId);
    if (turnId && context.currentTurnId && turnId !== context.currentTurnId) {
      return;
    }
    this.resolvePendingUserInputsAsCancelled(context);
    await this.sendCommand(context, { type: "abort" });
  }

  async respondToRequest(
    _threadId: ThreadId,
    _requestId: ApprovalRequestId,
    _decision: ProviderApprovalDecision,
  ): Promise<void> {
    throw new Error("Pi does not expose approval requests through this integration.");
  }

  async respondToUserInput(
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: Record<string, unknown>,
  ): Promise<void> {
    const context = this.requireSession(threadId);
    const pending = context.pendingUserInputs.get(requestId);
    if (!pending) {
      throw new Error(`Unknown pending Pi user input request: ${requestId}`);
    }

    this.writeCommand(context, pending.response(answers));
    context.pendingUserInputs.delete(requestId);
    this.emitRuntimeEvent({
      ...this.createEventBase(context),
      ...(context.currentTurnId ? { turnId: context.currentTurnId } : {}),
      requestId: RuntimeRequestId.makeUnsafe(requestId),
      type: "user-input.resolved",
      payload: {
        answers,
      },
    });
  }

  async stopSession(threadId: ThreadId): Promise<void> {
    const context = this.sessions.get(threadId);
    if (!context) {
      return;
    }

    context.stopping = true;
    this.resolvePendingRequests(context, "Pi session stopped.");
    this.resolvePendingUserInputsAsCancelled(context);
    try {
      await this.sendCommand(context, { type: "abort" });
    } catch {
      // Best-effort only.
    }
    killChildTree(context.child);
    this.updateSession(context, {
      status: "closed",
      activeTurnId: undefined,
    });
    this.emitSessionExit(context, {
      reason: "Pi session stopped.",
      exitKind: "graceful",
      recoverable: true,
    });
    this.sessions.delete(threadId);
  }

  async listSessions(): Promise<ReadonlyArray<ProviderSession>> {
    return Array.from(this.sessions.values(), (context) => context.session);
  }

  async hasSession(threadId: ThreadId): Promise<boolean> {
    return this.sessions.has(threadId);
  }

  async readThread(threadId: ThreadId): Promise<PiThreadSnapshot> {
    this.requireSession(threadId);
    throw new Error("Reading historical Pi thread snapshots is not implemented yet.");
  }

  async rollbackThread(threadId: ThreadId, _numTurns: number): Promise<PiThreadSnapshot> {
    this.requireSession(threadId);
    throw new Error("Rolling back Pi threads is not supported by this integration.");
  }

  async stopAll(): Promise<void> {
    const threadIds = [...this.sessions.keys()];
    await Promise.all(threadIds.map((threadId) => this.stopSession(threadId)));
  }
}
