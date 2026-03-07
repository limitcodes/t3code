export type ThemeAppearance = "light" | "dark";

export type SupportedHighlighterThemeName =
  | "catppuccin-latte"
  | "catppuccin-mocha"
  | "github-dark"
  | "github-dark-default"
  | "github-dark-dimmed"
  | "github-dark-high-contrast"
  | "nord"
  | "dark-plus";

export const APPLIED_CUSTOM_THEME_IDS = [
  "catppuccin-latte",
  "catppuccin-mocha",
  "github-dark",
  "github-dark-default",
  "github-dark-dimmed",
  "github-dark-high-contrast",
  "nord",
  "visual-studio-2017-dark",
] as const;

export type AppliedCustomThemeId = (typeof APPLIED_CUSTOM_THEME_IDS)[number];

export interface AppliedCustomTheme {
  id: AppliedCustomThemeId;
  label: string;
  description: string;
  family: "catppuccin" | "github" | "nord" | "visual-studio";
  appearance: ThemeAppearance;
  dataTheme: AppliedCustomThemeId;
  diffThemeName: SupportedHighlighterThemeName;
}

export const APPLIED_CUSTOM_THEMES = {
  "catppuccin-latte": {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    description: "Catppuccin's light Latte palette.",
    family: "catppuccin",
    appearance: "light",
    dataTheme: "catppuccin-latte",
    diffThemeName: "catppuccin-latte",
  },
  "catppuccin-mocha": {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    description: "Catppuccin's dark Mocha palette.",
    family: "catppuccin",
    appearance: "dark",
    dataTheme: "catppuccin-mocha",
    diffThemeName: "catppuccin-mocha",
  },
  "github-dark": {
    id: "github-dark",
    label: "GitHub Dark",
    description: "The classic GitHub Dark theme.",
    family: "github",
    appearance: "dark",
    dataTheme: "github-dark",
    diffThemeName: "github-dark",
  },
  "github-dark-default": {
    id: "github-dark-default",
    label: "GitHub Dark Default",
    description: "GitHub's default modern dark palette.",
    family: "github",
    appearance: "dark",
    dataTheme: "github-dark-default",
    diffThemeName: "github-dark-default",
  },
  "github-dark-dimmed": {
    id: "github-dark-dimmed",
    label: "GitHub Dark Dimmed",
    description: "GitHub's dimmed dark palette.",
    family: "github",
    appearance: "dark",
    dataTheme: "github-dark-dimmed",
    diffThemeName: "github-dark-dimmed",
  },
  "github-dark-high-contrast": {
    id: "github-dark-high-contrast",
    label: "GitHub Dark High Contrast",
    description: "GitHub's high contrast dark palette.",
    family: "github",
    appearance: "dark",
    dataTheme: "github-dark-high-contrast",
    diffThemeName: "github-dark-high-contrast",
  },
  nord: {
    id: "nord",
    label: "Nord",
    description: "The official Nord dark palette.",
    family: "nord",
    appearance: "dark",
    dataTheme: "nord",
    diffThemeName: "nord",
  },
  "visual-studio-2017-dark": {
    id: "visual-studio-2017-dark",
    label: "Visual Studio 2017 Dark (C/C++)",
    description: "The 2017 Dark Visual Studio C/C++ palette.",
    family: "visual-studio",
    appearance: "dark",
    dataTheme: "visual-studio-2017-dark",
    diffThemeName: "dark-plus",
  },
} as const satisfies Record<AppliedCustomThemeId, AppliedCustomTheme>;

export const CUSTOM_THEME_IDS = ["none", "catppuccin-auto", ...APPLIED_CUSTOM_THEME_IDS] as const;

export type CustomThemeId = (typeof CUSTOM_THEME_IDS)[number];

export interface CustomThemeOption {
  id: CustomThemeId;
  label: string;
  description: string;
  family: "default" | AppliedCustomTheme["family"];
  appearance: ThemeAppearance | "system" | null;
}

export const CUSTOM_THEME_OPTIONS = [
  {
    id: "none",
    label: "Default theme",
    description: "Use T3 Code's built-in theme tokens.",
    family: "default",
    appearance: null,
  },
  {
    id: "catppuccin-auto",
    label: "Catppuccin (follow appearance)",
    description: "Apply Latte in light mode and Mocha in dark mode.",
    family: "catppuccin",
    appearance: "system",
  },
  ...APPLIED_CUSTOM_THEME_IDS.map((id) => ({
    id,
    label: APPLIED_CUSTOM_THEMES[id].label,
    description: APPLIED_CUSTOM_THEMES[id].description,
    family: APPLIED_CUSTOM_THEMES[id].family,
    appearance: APPLIED_CUSTOM_THEMES[id].appearance,
  })),
] as const satisfies readonly CustomThemeOption[];

export const CUSTOM_THEME_OPTIONS_BY_ID = Object.fromEntries(
  CUSTOM_THEME_OPTIONS.map((option) => [option.id, option]),
) as Record<CustomThemeId, CustomThemeOption>;

export function isCustomThemeId(value: string): value is CustomThemeId {
  return value in CUSTOM_THEME_OPTIONS_BY_ID;
}

export function isCustomThemeEnabled(customThemeId: CustomThemeId): boolean {
  return customThemeId !== "none";
}

export function resolvePinnedCustomThemeAppearance(
  customThemeId: CustomThemeId,
): ThemeAppearance | null {
  const appearance = CUSTOM_THEME_OPTIONS_BY_ID[customThemeId].appearance;
  return appearance === "light" || appearance === "dark" ? appearance : null;
}

export function resolveAppliedCustomThemeId(
  customThemeId: CustomThemeId,
  baseAppearance: ThemeAppearance,
): AppliedCustomThemeId | null {
  switch (customThemeId) {
    case "none":
      return null;
    case "catppuccin-auto":
      return baseAppearance === "dark" ? "catppuccin-mocha" : "catppuccin-latte";
    default:
      return customThemeId;
  }
}

export function resolveAppliedCustomTheme(
  customThemeId: CustomThemeId,
  baseAppearance: ThemeAppearance,
): AppliedCustomTheme | null {
  const appliedCustomThemeId = resolveAppliedCustomThemeId(customThemeId, baseAppearance);
  return appliedCustomThemeId ? APPLIED_CUSTOM_THEMES[appliedCustomThemeId] : null;
}
