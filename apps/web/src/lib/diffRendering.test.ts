import { describe, expect, it } from "vitest";
import { ALL_DIFF_THEME_NAMES, buildPatchCacheKey, resolveDiffThemeName } from "./diffRendering";

describe("buildPatchCacheKey", () => {
  it("returns a stable cache key for identical content", () => {
    const patch = "diff --git a/a.ts b/a.ts\n+console.log('hello')";

    expect(buildPatchCacheKey(patch)).toBe(buildPatchCacheKey(patch));
  });

  it("normalizes outer whitespace before hashing", () => {
    const patch = "diff --git a/a.ts b/a.ts\n+console.log('hello')";

    expect(buildPatchCacheKey(`\n${patch}\n`)).toBe(buildPatchCacheKey(patch));
  });

  it("changes when diff content changes", () => {
    const before = "diff --git a/a.ts b/a.ts\n+console.log('hello')";
    const after = "diff --git a/a.ts b/a.ts\n+console.log('hello world')";

    expect(buildPatchCacheKey(before)).not.toBe(buildPatchCacheKey(after));
  });

  it("changes when cache scope changes", () => {
    const patch = "diff --git a/a.ts b/a.ts\n+console.log('hello')";

    expect(buildPatchCacheKey(patch, "diff-panel:light")).not.toBe(
      buildPatchCacheKey(patch, "diff-panel:dark"),
    );
  });
});

describe("resolveDiffThemeName", () => {
  it("returns the default Pierre themes when no custom theme is active", () => {
    expect(resolveDiffThemeName("light")).toBe("pierre-light");
    expect(resolveDiffThemeName("dark")).toBe("pierre-dark");
  });

  it("returns integrated preset theme ids when a custom preset is active", () => {
    expect(resolveDiffThemeName("light", "catppuccin-latte")).toBe("catppuccin-latte");
    expect(resolveDiffThemeName("dark", "github-dark-dimmed")).toBe("github-dark-dimmed");
    expect(resolveDiffThemeName("dark", "visual-studio-2017-dark")).toBe("dark-plus");
    expect(resolveDiffThemeName("dark", "t3-chat-theme")).toBe("catppuccin-mocha");
  });
});

describe("ALL_DIFF_THEME_NAMES", () => {
  it("includes the default themes plus all bundled custom preset highlighters", () => {
    expect(ALL_DIFF_THEME_NAMES).toEqual([
      "pierre-light",
      "pierre-dark",
      "catppuccin-latte",
      "catppuccin-mocha",
      "github-dark",
      "github-dark-default",
      "github-dark-dimmed",
      "github-dark-high-contrast",
      "nord",
      "dark-plus",
    ]);
  });
});
