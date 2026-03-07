import { clamp } from "effect/Number";

const USED_TOKEN_KEYS = new Set([
  "current",
  "currenttokens",
  "tokensused",
  "totaltokens",
  "used",
  "usedtokens",
]);
const MAX_TOKEN_KEYS = new Set([
  "contextwindow",
  "contextwindowtokens",
  "limit",
  "limittokens",
  "max",
  "maxtokens",
  "modelcontextwindow",
  "tokenlimit",
  "windowtokens",
]);
const REMAINING_TOKEN_KEYS = new Set([
  "available",
  "availabletokens",
  "remaining",
  "remainingtokens",
  "tokensleft",
  "tokensremaining",
]);
const INPUT_TOKEN_KEYS = new Set([
  "inputtokens",
  "prompttokens",
]);
const OUTPUT_TOKEN_KEYS = new Set([
  "completiontokens",
  "outputtokens",
]);
const REASONING_TOKEN_KEYS = new Set([
  "reasoningoutputtokens",
  "reasoningtokens",
]);
const USED_PERCENT_KEYS = new Set([
  "percentused",
  "usedpercent",
  "usagepercent",
  "utilization",
]);

export interface NormalizedThreadTokenUsage {
  usedTokens: number;
  maxTokens: number;
  remainingTokens: number;
  usedFraction: number;
  usedPercent: number;
  remainingPercent: number;
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toPercentFraction(value: number | null): number | null {
  if (value === null || value < 0) return null;
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  return null;
}

function findMatchingNumber(
  value: unknown,
  expectedKeys: ReadonlySet<string>,
  visited = new Set<object>(),
): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (visited.has(value)) {
    return null;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = findMatchingNumber(entry, expectedKeys, visited);
      if (match !== null) {
        return match;
      }
    }
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (expectedKeys.has(normalizeKey(key))) {
      const numeric = asFiniteNumber(entry);
      if (numeric !== null) {
        return numeric;
      }
    }
  }

  for (const entry of Object.values(value)) {
    const match = findMatchingNumber(entry, expectedKeys, visited);
    if (match !== null) {
      return match;
    }
  }

  return null;
}

function roundTokenCount(value: number): number {
  return Math.max(0, Math.round(value));
}

export function normalizeThreadTokenUsage(value: unknown): NormalizedThreadTokenUsage | null {
  const directValue = asFiniteNumber(value);
  if (directValue !== null && directValue > 0) {
    return null;
  }

  const usedTokens = findMatchingNumber(value, USED_TOKEN_KEYS);
  const maxTokens = findMatchingNumber(value, MAX_TOKEN_KEYS);
  const remainingTokens = findMatchingNumber(value, REMAINING_TOKEN_KEYS);
  const inputTokens = findMatchingNumber(value, INPUT_TOKEN_KEYS);
  const outputTokens = findMatchingNumber(value, OUTPUT_TOKEN_KEYS);
  const reasoningTokens = findMatchingNumber(value, REASONING_TOKEN_KEYS);
  const usedFractionFromPercent = toPercentFraction(findMatchingNumber(value, USED_PERCENT_KEYS));

  let resolvedUsed =
    usedTokens ??
    (inputTokens !== null && outputTokens !== null
      ? inputTokens + outputTokens + Math.max(0, reasoningTokens ?? 0)
      : null);
  let resolvedMax = maxTokens;
  let resolvedRemaining = remainingTokens;

  if (
    (resolvedUsed === null || resolvedMax === null) &&
    resolvedMax !== null &&
    resolvedRemaining !== null
  ) {
    resolvedUsed = resolvedMax - resolvedRemaining;
  }

  if (
    (resolvedRemaining === null || resolvedMax === null) &&
    resolvedUsed !== null &&
    resolvedMax !== null
  ) {
    resolvedRemaining = resolvedMax - resolvedUsed;
  }

  if (
    usedFractionFromPercent !== null &&
    resolvedMax === null &&
    resolvedUsed !== null &&
    usedFractionFromPercent > 0
  ) {
    resolvedMax = resolvedUsed / usedFractionFromPercent;
  }

  if (
    usedFractionFromPercent !== null &&
    resolvedMax === null &&
    resolvedRemaining !== null &&
    usedFractionFromPercent < 1
  ) {
    resolvedMax = resolvedRemaining / (1 - usedFractionFromPercent);
  }

  if (
    resolvedUsed === null &&
    resolvedMax !== null &&
    resolvedRemaining !== null
  ) {
    resolvedUsed = resolvedMax - resolvedRemaining;
  }

  if (
    resolvedRemaining === null &&
    resolvedUsed !== null &&
    resolvedMax !== null
  ) {
    resolvedRemaining = resolvedMax - resolvedUsed;
  }

  if (
    resolvedUsed === null ||
    resolvedMax === null ||
    resolvedRemaining === null ||
    !Number.isFinite(resolvedUsed) ||
    !Number.isFinite(resolvedMax) ||
    !Number.isFinite(resolvedRemaining) ||
    resolvedMax <= 0
  ) {
    return null;
  }

  const normalizedUsed = roundTokenCount(clamp(resolvedUsed, { minimum: 0, maximum: resolvedMax }));
  const normalizedMax = roundTokenCount(resolvedMax);
  const normalizedRemaining = Math.max(0, normalizedMax - normalizedUsed);
  const usedFraction = clamp(normalizedUsed / normalizedMax, { minimum: 0, maximum: 1 });
  const usedPercent = Math.round(usedFraction * 100);

  return {
    usedTokens: normalizedUsed,
    maxTokens: normalizedMax,
    remainingTokens: normalizedRemaining,
    usedFraction,
    usedPercent,
    remainingPercent: 100 - usedPercent,
  };
}

export function formatTokenCountCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${stripTrailingZero((value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1))}m`;
  }
  if (abs >= 1_000) {
    return `${stripTrailingZero((value / 1_000).toFixed(abs >= 10_000 ? 0 : 1))}k`;
  }
  return String(value);
}

export function formatTokenCountFull(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function stripTrailingZero(value: string): string {
  return value.replace(/\.0$/, "");
}
