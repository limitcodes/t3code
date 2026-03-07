import { describe, expect, it } from "vitest";

import {
  formatTokenCountCompact,
  formatTokenCountFull,
  normalizeThreadTokenUsage,
} from "./threadTokenUsage";

describe("normalizeThreadTokenUsage", () => {
  it("reads direct used/max token counters", () => {
    expect(
      normalizeThreadTokenUsage({
        usedTokens: 99_000,
        maxTokens: 950_000,
      }),
    ).toEqual({
      usedTokens: 99_000,
      maxTokens: 950_000,
      remainingTokens: 851_000,
      usedFraction: 99_000 / 950_000,
      usedPercent: 10,
      remainingPercent: 90,
    });
  });

  it("derives the used value when only remaining and max are present", () => {
    expect(
      normalizeThreadTokenUsage({
        contextWindow: {
          remainingTokens: 400_000,
          maxTokens: 500_000,
        },
      }),
    ).toEqual({
      usedTokens: 100_000,
      maxTokens: 500_000,
      remainingTokens: 400_000,
      usedFraction: 0.2,
      usedPercent: 20,
      remainingPercent: 80,
    });
  });

  it("uses percent metadata to infer the max token count when needed", () => {
    expect(
      normalizeThreadTokenUsage({
        usage: {
          currentTokens: 50_000,
          usedPercent: 25,
        },
      }),
    ).toEqual({
      usedTokens: 50_000,
      maxTokens: 200_000,
      remainingTokens: 150_000,
      usedFraction: 0.25,
      usedPercent: 25,
      remainingPercent: 75,
    });
  });

  it("understands Codex nested token usage snapshots", () => {
    expect(
      normalizeThreadTokenUsage({
        threadId: "thread",
        turnId: "turn",
        tokenUsage: {
          total: {
            totalTokens: 600_294,
            inputTokens: 596_940,
          },
          last: {
            totalTokens: 68_107,
          },
          modelContextWindow: 950_000,
        },
      }),
    ).toEqual({
      usedTokens: 600_294,
      maxTokens: 950_000,
      remainingTokens: 349_706,
      usedFraction: 600_294 / 950_000,
      usedPercent: 63,
      remainingPercent: 37,
    });
  });

  it("understands flat Copilot-style usage payloads", () => {
    expect(
      normalizeThreadTokenUsage({
        promptTokens: 12_000,
        completionTokens: 800,
        totalTokens: 12_800,
        modelContextWindow: 128_000,
      }),
    ).toEqual({
      usedTokens: 12_800,
      maxTokens: 128_000,
      remainingTokens: 115_200,
      usedFraction: 0.1,
      usedPercent: 10,
      remainingPercent: 90,
    });
  });

  it("can derive used tokens from prompt and completion counts when total is missing", () => {
    expect(
      normalizeThreadTokenUsage({
        promptTokens: 12_000,
        completionTokens: 800,
        maxTokens: 128_000,
      }),
    ).toEqual({
      usedTokens: 12_800,
      maxTokens: 128_000,
      remainingTokens: 115_200,
      usedFraction: 0.1,
      usedPercent: 10,
      remainingPercent: 90,
    });
  });

  it("returns null when the payload does not expose enough data", () => {
    expect(normalizeThreadTokenUsage({ currentTokens: 50_000 })).toBeNull();
    expect(normalizeThreadTokenUsage(null)).toBeNull();
  });
});

describe("token usage formatters", () => {
  it("formats compact token counts using lowercase suffixes", () => {
    expect(formatTokenCountCompact(99_000)).toBe("99k");
    expect(formatTokenCountCompact(950_000)).toBe("950k");
    expect(formatTokenCountCompact(1_250_000)).toBe("1.3m");
  });

  it("formats full token counts with thousands separators", () => {
    expect(formatTokenCountFull(851_000)).toBe("851,000");
  });
});
