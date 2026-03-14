import { describe, expect, it } from "vitest";

import { formatGitHubCopilotPlan } from "./copilotPlan";

describe("formatGitHubCopilotPlan", () => {
  it("maps GitHub internal individual plan keys to documented labels", () => {
    expect(formatGitHubCopilotPlan("individual_pro")).toBe("Copilot Pro");
    expect(formatGitHubCopilotPlan("individual_pro_plus")).toBe("Copilot Pro+");
    expect(formatGitHubCopilotPlan("individual_student")).toBe("Copilot Student");
    expect(formatGitHubCopilotPlan("individual_free")).toBe("Copilot Free");
  });

  it("maps organization and enterprise plan keys to documented labels", () => {
    expect(formatGitHubCopilotPlan("business")).toBe("Copilot Business");
    expect(formatGitHubCopilotPlan("enterprise")).toBe("Copilot Enterprise");
  });

  it("preserves already human-readable labels and falls back for unknown variants", () => {
    expect(formatGitHubCopilotPlan("Copilot Pro+")).toBe("Copilot Pro+");
    expect(formatGitHubCopilotPlan("enterprise_preview")).toBe("Enterprise Preview");
  });
});
