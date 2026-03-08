import { describe, expect, it } from "vitest";

import {
  buildDroidCliArgs,
  isDroidModelAvailable,
  normalizeDroidStartErrorMessage,
  readAvailableDroidModelIds,
} from "./droidAcpManager";

describe("droidAcpManager model availability", () => {
  it("reads ACP-advertised model ids", () => {
    expect(
      readAvailableDroidModelIds({
        currentModelId: "claude-opus-4-6",
        availableModels: [
          { modelId: "claude-opus-4-6", name: "Claude Opus 4.6" },
          { modelId: "gpt-5.4", name: "GPT-5.4" },
        ],
      }),
    ).toEqual(["claude-opus-4-6", "gpt-5.4"]);
  });

  it("treats requested models as unavailable when ACP advertises a different model set", () => {
    expect(
      isDroidModelAvailable(
        {
          currentModelId: "claude-opus-4-6",
          availableModels: [{ modelId: "claude-opus-4-6", name: "Claude Opus 4.6" }],
        },
        "gpt-5.4",
      ),
    ).toBe(false);
  });

  it("allows requested models when ACP has not advertised any model set yet", () => {
    expect(isDroidModelAvailable(null, "gpt-5.4")).toBe(true);
  });

  it("builds ACP startup args", () => {
    expect(buildDroidCliArgs()).toEqual(["exec", "--output-format", "acp"]);
  });

  it("normalizes auth-required startup errors", () => {
    expect(
      normalizeDroidStartErrorMessage(
        "AUTH_REQUIRED: Authenticate with Factory using a device pairing code in your browser.",
      ),
    ).toBe(
      "Factory Droid requires authentication. Use `/login` in `droid`, or set FACTORY_API_KEY and try again.",
    );
  });
});
