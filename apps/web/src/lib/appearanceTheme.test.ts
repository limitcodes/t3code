import { describe, expect, it } from "vitest";

import {
  DEFAULT_DARK_APPEARANCE_THEME,
  DEFAULT_LIGHT_APPEARANCE_THEME,
  deriveAppearanceCssVariables,
  hasCustomizedAppearanceColorTheme,
  normalizeAppearanceThemeConfig,
  parseImportedAppearanceTheme,
  serializeAppearanceTheme,
} from "./appearanceTheme";

describe("normalizeAppearanceThemeConfig", () => {
  it("sanitizes invalid light theme values back to defaults", () => {
    expect(
      normalizeAppearanceThemeConfig(
        {
          ...DEFAULT_LIGHT_APPEARANCE_THEME,
          accent: "nope",
          background: "#fff",
          foreground: "#123456",
          uiFont: "Custom Font; color:red;",
          contrast: 999,
        },
        "light",
      ),
    ).toEqual({
      ...DEFAULT_LIGHT_APPEARANCE_THEME,
      accent: DEFAULT_LIGHT_APPEARANCE_THEME.accent,
      background: "#ffffff",
      foreground: "#123456",
      uiFont: DEFAULT_LIGHT_APPEARANCE_THEME.uiFont,
      contrast: 100,
    });
  });
});

describe("parseImportedAppearanceTheme", () => {
  it("imports a valid theme object", () => {
    expect(
      parseImportedAppearanceTheme(
        JSON.stringify({
          accent: "#cc7d5e",
          background: "#f9f9f7",
          foreground: "#2d2d2b",
          uiFont: "Styrene A, sans-serif",
          codeFont: 'ui-monospace, "SF Mono"',
          translucentSidebar: true,
          contrast: 28,
        }),
        "light",
      ),
    ).toEqual({
      accent: "#cc7d5e",
      background: "#f9f9f7",
      foreground: "#2d2d2b",
      uiFont: "Styrene A, sans-serif",
      codeFont: 'ui-monospace, "SF Mono"',
      translucentSidebar: true,
      contrast: 28,
    });
  });

  it("accepts nested theme payloads", () => {
    expect(
      parseImportedAppearanceTheme(
        JSON.stringify({
          theme: {
            accent: "#0ea5e9",
          },
        }),
        "dark",
      ),
    ).toMatchObject({
      ...DEFAULT_DARK_APPEARANCE_THEME,
      accent: "#0ea5e9",
    });
  });
});

describe("serializeAppearanceTheme", () => {
  it("serializes a stable JSON shape", () => {
    expect(JSON.parse(serializeAppearanceTheme(DEFAULT_LIGHT_APPEARANCE_THEME))).toEqual(
      DEFAULT_LIGHT_APPEARANCE_THEME,
    );
  });
});

describe("deriveAppearanceCssVariables", () => {
  it("returns core token variables for the active appearance", () => {
    const variables = deriveAppearanceCssVariables(DEFAULT_DARK_APPEARANCE_THEME, "dark");

    expect(variables["--background"]).toBe(DEFAULT_DARK_APPEARANCE_THEME.background);
    expect(variables["--foreground"]).toBe(DEFAULT_DARK_APPEARANCE_THEME.foreground);
    expect(variables["--primary"]).toBe(DEFAULT_DARK_APPEARANCE_THEME.accent);
    expect(variables["--font-code-snippet"]).toBe(DEFAULT_DARK_APPEARANCE_THEME.codeFont);
    expect(variables["--font-ui"]).toBe(DEFAULT_DARK_APPEARANCE_THEME.uiFont);
    expect(variables["--sidebar"]).toBeTruthy();
  });
});

describe("hasCustomizedAppearanceColorTheme", () => {
  it("does not treat untouched light and dark defaults as custom color overrides", () => {
    expect(hasCustomizedAppearanceColorTheme(DEFAULT_LIGHT_APPEARANCE_THEME, "light")).toBe(false);
    expect(hasCustomizedAppearanceColorTheme(DEFAULT_DARK_APPEARANCE_THEME, "dark")).toBe(false);
  });

  it("ignores font-only changes when deciding whether to replace built-in palette tokens", () => {
    expect(
      hasCustomizedAppearanceColorTheme(
        {
          ...DEFAULT_DARK_APPEARANCE_THEME,
          uiFont: "Styrene A, sans-serif",
        },
        "dark",
      ),
    ).toBe(false);
  });

  it("treats color changes as palette overrides", () => {
    expect(
      hasCustomizedAppearanceColorTheme(
        {
          ...DEFAULT_DARK_APPEARANCE_THEME,
          background: "#111827",
        },
        "dark",
      ),
    ).toBe(true);
  });
});
