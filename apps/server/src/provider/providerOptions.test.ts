import { describe, expect, it } from "vitest";

import {
  deriveProviderSecretRequirements,
  hydrateProviderOptionsWithEnvironment,
  sanitizeProviderOptionsForPersistence,
  sanitizeProviderSecretRequirementsRecord,
  sanitizeProviderOptionsRecordForPersistence,
} from "./providerOptions";

describe("sanitizeProviderOptionsForPersistence", () => {
  it("strips OpenRouter API keys before persisting provider options", () => {
    expect(
      sanitizeProviderOptionsForPersistence({
        codex: {
          binaryPath: "/tmp/codex",
          homePath: "/tmp/.codex",
          openRouterApiKey: "sk-or-secret",
        },
      }),
    ).toEqual({
      codex: {
        binaryPath: "/tmp/codex",
        homePath: "/tmp/.codex",
      },
    });
  });

  it("persists the OpenCode binary override without adding extra fields", () => {
    expect(
      sanitizeProviderOptionsForPersistence({
        opencode: {
          binaryPath: "/tmp/opencode",
          openRouterApiKey: "sk-or-secret",
        },
      }),
    ).toEqual({
      opencode: {
        binaryPath: "/tmp/opencode",
      },
    });
  });
});

describe("sanitizeProviderOptionsRecordForPersistence", () => {
  it("drops untrusted OpenRouter API keys from runtime payloads", () => {
    expect(
      sanitizeProviderOptionsRecordForPersistence({
        codex: {
          binaryPath: "/tmp/codex",
          homePath: "/tmp/.codex",
          openRouterApiKey: "sk-or-secret",
        },
      }),
    ).toEqual({
      codex: {
        binaryPath: "/tmp/codex",
        homePath: "/tmp/.codex",
      },
    });
  });

  it("keeps trusted OpenCode binary overrides from runtime payloads", () => {
    expect(
      sanitizeProviderOptionsRecordForPersistence({
        opencode: {
          binaryPath: "/tmp/opencode",
          openRouterApiKey: "sk-or-secret",
        },
      }),
    ).toEqual({
      opencode: {
        binaryPath: "/tmp/opencode",
      },
    });
  });
});

describe("provider secret requirements", () => {
  it("records which transient provider secrets were intentionally stripped", () => {
    expect(
      deriveProviderSecretRequirements({
        codex: {
          openRouterApiKey: "sk-or-secret",
        },
        kimi: {
          apiKey: "sk-kimi-secret",
        },
      }),
    ).toEqual({
      codex: {
        openRouterApiKey: true,
      },
      kimi: {
        apiKey: true,
      },
    });
  });

  it("sanitizes persisted secret-requirement markers", () => {
    expect(
      sanitizeProviderSecretRequirementsRecord({
        codex: {
          openRouterApiKey: true,
          leaked: "nope",
        },
        kimi: {
          apiKey: true,
        },
      }),
    ).toEqual({
      codex: {
        openRouterApiKey: true,
      },
      kimi: {
        apiKey: true,
      },
    });
  });

  it("rehydrates required secrets from environment variables", () => {
    expect(
      hydrateProviderOptionsWithEnvironment({
        providerOptions: {
          codex: {
            binaryPath: "/tmp/codex",
          },
          kimi: {
            binaryPath: "/tmp/kimi",
          },
        },
        secretRequirements: {
          codex: {
            openRouterApiKey: true,
          },
          kimi: {
            apiKey: true,
          },
        },
        env: {
          OPENROUTER_API_KEY: "sk-or-fresh",
          KIMI_API_KEY: "sk-kimi-fresh",
        },
      }),
    ).toEqual({
      providerOptions: {
        codex: {
          binaryPath: "/tmp/codex",
          openRouterApiKey: "sk-or-fresh",
        },
        kimi: {
          binaryPath: "/tmp/kimi",
          apiKey: "sk-kimi-fresh",
        },
      },
      missingSecrets: [],
    });
  });

  it("reports missing recovery secrets when env fallbacks are unavailable", () => {
    expect(
      hydrateProviderOptionsWithEnvironment({
        providerOptions: {
          opencode: {
            binaryPath: "/tmp/opencode",
          },
        },
        secretRequirements: {
          opencode: {
            openRouterApiKey: true,
          },
        },
        env: {},
      }),
    ).toEqual({
      providerOptions: {
        opencode: {
          binaryPath: "/tmp/opencode",
        },
      },
      missingSecrets: ["OPENROUTER_API_KEY"],
    });
  });
});
