import {
  APPLIED_CUSTOM_THEME_IDS,
  APPLIED_CUSTOM_THEMES,
  type AppliedCustomThemeId,
  type SupportedHighlighterThemeName,
} from "./customThemes";

const DEFAULT_DIFF_THEME_NAMES = {
  light: "pierre-light",
  dark: "pierre-dark",
} as const;

export type DiffThemeName =
  | (typeof DEFAULT_DIFF_THEME_NAMES)[keyof typeof DEFAULT_DIFF_THEME_NAMES]
  | SupportedHighlighterThemeName;

export const ALL_DIFF_THEME_NAMES = Array.from(
  new Set([
    DEFAULT_DIFF_THEME_NAMES.light,
    DEFAULT_DIFF_THEME_NAMES.dark,
    ...APPLIED_CUSTOM_THEME_IDS.map((id) => APPLIED_CUSTOM_THEMES[id].diffThemeName),
  ]),
) as ReadonlyArray<DiffThemeName>;

export function resolveDiffThemeName(
  theme: "light" | "dark",
  activeCustomThemeId: AppliedCustomThemeId | null = null,
): DiffThemeName {
  if (activeCustomThemeId) {
    return APPLIED_CUSTOM_THEMES[activeCustomThemeId].diffThemeName;
  }

  return theme === "dark" ? DEFAULT_DIFF_THEME_NAMES.dark : DEFAULT_DIFF_THEME_NAMES.light;
}

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const SECONDARY_HASH_SEED = 0x9e3779b9;
const SECONDARY_HASH_MULTIPLIER = 0x85ebca6b;

export function fnv1a32(
  input: string,
  seed = FNV_OFFSET_BASIS_32,
  multiplier = FNV_PRIME_32,
): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, multiplier) >>> 0;
  }
  return hash >>> 0;
}

export function buildPatchCacheKey(patch: string, scope = "diff-panel"): string {
  const normalizedPatch = patch.trim();
  const primary = fnv1a32(normalizedPatch, FNV_OFFSET_BASIS_32, FNV_PRIME_32).toString(36);
  const secondary = fnv1a32(
    normalizedPatch,
    SECONDARY_HASH_SEED,
    SECONDARY_HASH_MULTIPLIER,
  ).toString(36);
  return `${scope}:${normalizedPatch.length}:${primary}:${secondary}`;
}
