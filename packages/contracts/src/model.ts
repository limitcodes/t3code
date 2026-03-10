import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import { ProviderKind } from "./orchestration";

export const CODEX_REASONING_EFFORT_OPTIONS = ["xhigh", "high", "medium", "low"] as const;
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORT_OPTIONS)[number];
export const COPILOT_REASONING_EFFORT_VALUES = CODEX_REASONING_EFFORT_OPTIONS;
export const COPILOT_REASONING_EFFORT_OPTIONS = ["low", "medium", "high"] as const;
export type CopilotReasoningEffort = (typeof COPILOT_REASONING_EFFORT_VALUES)[number];

export const CodexModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(Schema.Literals(CODEX_REASONING_EFFORT_OPTIONS)),
  fastMode: Schema.optional(Schema.Boolean),
});
export type CodexModelOptions = typeof CodexModelOptions.Type;

export const CopilotModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(Schema.Literals(COPILOT_REASONING_EFFORT_VALUES)),
});
export type CopilotModelOptions = typeof CopilotModelOptions.Type;

export const DroidModelOptions = Schema.Struct({
  mode: Schema.optional(TrimmedNonEmptyString),
});
export type DroidModelOptions = typeof DroidModelOptions.Type;

export const ProviderModelOptions = Schema.Struct({
  codex: Schema.optional(CodexModelOptions),
  copilot: Schema.optional(CopilotModelOptions),
  droid: Schema.optional(DroidModelOptions),
});
export type ProviderModelOptions = typeof ProviderModelOptions.Type;

type ModelOption = {
  readonly slug: string;
  readonly name: string;
};

export const PI_PROVIDER_OPTIONS = ["anthropic", "openai", "google", "github"] as const;
export type PiProvider = (typeof PI_PROVIDER_OPTIONS)[number];

export const MODEL_OPTIONS_BY_PROVIDER = {
  codex: [
    { slug: "gpt-5.4", name: "GPT-5.4" },
    { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { slug: "gpt-5.3-codex-spark", name: "GPT-5.3 Codex Spark" },
    { slug: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
    { slug: "gpt-5.2", name: "GPT-5.2" },
  ],
  copilot: [
    { slug: "claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { slug: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { slug: "claude-haiku-4.5", name: "Claude Haiku 4.5" },
    { slug: "claude-opus-4.6", name: "Claude Opus 4.6" },
    { slug: "claude-opus-4.6-fast", name: "Claude Opus 4.6 Fast" },
    { slug: "claude-opus-4.5", name: "Claude Opus 4.5" },
    { slug: "claude-sonnet-4", name: "Claude Sonnet 4" },
    { slug: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
    { slug: "gpt-5.4", name: "GPT-5.4" },
    { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { slug: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
    { slug: "gpt-5.2", name: "GPT-5.2" },
    { slug: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
    { slug: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
    { slug: "gpt-5.1", name: "GPT-5.1" },
    { slug: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini" },
    { slug: "gpt-5-mini", name: "GPT-5 Mini" },
    { slug: "gpt-4.1", name: "GPT-4.1" },
  ],
  kimi: [{ slug: "kimi-for-coding", name: "Kimi for Coding" }],
  droid: [
    { slug: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { slug: "claude-opus-4-6-fast", name: "Claude Opus 4.6 Fast Mode" },
    { slug: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
    { slug: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { slug: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
    { slug: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
    { slug: "gpt-5.4", name: "GPT-5.4" },
    { slug: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
    { slug: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
    { slug: "gpt-5.2", name: "GPT-5.2" },
    { slug: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
    { slug: "gpt-5.1-codex", name: "GPT-5.1 Codex" },
    { slug: "gpt-5.1", name: "GPT-5.1" },
    { slug: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
    { slug: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
    { slug: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    { slug: "glm-4.7", name: "Droid Core (GLM-4.7)" },
    { slug: "glm-5", name: "Droid Core (GLM-5)" },
    { slug: "kimi-k2.5", name: "Droid Core (Kimi K2.5)" },
    { slug: "minimax-m2.5", name: "Droid Core (MiniMax M2.5)" },
  ],
  // Pi model list is intentionally empty — available models are fetched
  // dynamically via `get_available_models` RPC on session start and surfaced
  // through the `session.configured` activity. The default slug below acts
  // only as an initial placeholder before any pi session has run.
  pi: [] as ReadonlyArray<ModelOption>,
} as const satisfies Record<ProviderKind, readonly ModelOption[]>;
export type ModelOptionsByProvider = typeof MODEL_OPTIONS_BY_PROVIDER;

type BuiltInModelSlug = ModelOptionsByProvider[ProviderKind][number]["slug"];
export type ModelSlug = BuiltInModelSlug | (string & {});

export const DEFAULT_MODEL_BY_PROVIDER = {
  codex: "gpt-5.4",
  copilot: "claude-sonnet-4.5",
  kimi: "kimi-for-coding",
  droid: "claude-opus-4-6",
  pi: "claude-sonnet-4-20250514",
} as const satisfies Record<ProviderKind, ModelSlug>;

export const MODEL_SLUG_ALIASES_BY_PROVIDER = {
  codex: {
    "5.4": "gpt-5.4",
    "5.3": "gpt-5.3-codex",
    "gpt-5.3": "gpt-5.3-codex",
    "5.3-spark": "gpt-5.3-codex-spark",
    "gpt-5.3-spark": "gpt-5.3-codex-spark",
  },
  copilot: {},
  kimi: {},
  droid: {},
  pi: {},
} as const satisfies Record<ProviderKind, Record<string, ModelSlug>>;

export const REASONING_EFFORT_OPTIONS_BY_PROVIDER = {
  codex: CODEX_REASONING_EFFORT_OPTIONS,
  copilot: COPILOT_REASONING_EFFORT_OPTIONS,
  kimi: [],
  droid: [],
  pi: [],
} as const satisfies Record<ProviderKind, readonly CodexReasoningEffort[]>;

export const DEFAULT_REASONING_EFFORT_BY_PROVIDER = {
  codex: "high",
  copilot: "high",
  kimi: null,
  droid: null,
  pi: null,
} as const satisfies Record<ProviderKind, CodexReasoningEffort | null>;
