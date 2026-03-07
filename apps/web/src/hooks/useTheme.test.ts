import { describe, expect, it } from "vitest";

import { resolveAppliedCustomTheme, resolveAppliedCustomThemeId } from "../lib/customThemes";
import { resolveEffectiveThemeAppearance, resolveThemeAppearance } from "./useTheme";

describe("resolveThemeAppearance", () => {
  it("returns explicit light and dark preferences unchanged", () => {
    expect(resolveThemeAppearance("light", true)).toBe("light");
    expect(resolveThemeAppearance("dark", false)).toBe("dark");
  });

  it("resolves system preference from the platform color scheme", () => {
    expect(resolveThemeAppearance("system", false)).toBe("light");
    expect(resolveThemeAppearance("system", true)).toBe("dark");
  });
});

describe("resolveEffectiveThemeAppearance", () => {
  it("keeps the base appearance when no custom preset is selected", () => {
    expect(resolveEffectiveThemeAppearance("system", false, "none")).toBe("light");
    expect(resolveEffectiveThemeAppearance("system", true, "none")).toBe("dark");
  });

  it("lets explicit presets override the effective appearance", () => {
    expect(resolveEffectiveThemeAppearance("light", false, "github-dark")).toBe("dark");
    expect(resolveEffectiveThemeAppearance("dark", true, "catppuccin-latte")).toBe("light");
  });
});

describe("resolveAppliedCustomThemeId", () => {
  it("returns null when custom themes are disabled", () => {
    expect(resolveAppliedCustomThemeId("none", "light")).toBeNull();
  });

  it("maps Catppuccin auto mode to the active light or dark flavor", () => {
    expect(resolveAppliedCustomThemeId("catppuccin-auto", "light")).toBe("catppuccin-latte");
    expect(resolveAppliedCustomThemeId("catppuccin-auto", "dark")).toBe("catppuccin-mocha");
  });

  it("returns explicit preset ids unchanged", () => {
    expect(resolveAppliedCustomThemeId("nord", "light")).toBe("nord");
    expect(resolveAppliedCustomThemeId("visual-studio-2017-dark", "dark")).toBe(
      "visual-studio-2017-dark",
    );
  });
});

describe("resolveAppliedCustomTheme", () => {
  it("returns the applied preset metadata", () => {
    expect(resolveAppliedCustomTheme("catppuccin-auto", "dark")?.label).toBe(
      "Catppuccin Mocha",
    );
    expect(resolveAppliedCustomTheme("github-dark-dimmed", "light")?.appearance).toBe("dark");
  });
});
