import { describe, expect, it } from "vitest";

import { fetchCopilotUsageSummary } from "./copilotUsage";

describe("fetchCopilotUsageSummary", () => {
  it("normalizes GitHub internal Copilot plan keys to documented labels", async () => {
    const usage = await fetchCopilotUsageSummary({
      now: () => new Date("2026-03-14T00:00:00.000Z"),
      readCliConfig: async () => ({ host: "https://github.com", login: "octocat" }),
      resolveGitHubToken: async () => "token",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            login: "octocat",
            copilot_plan: "individual_pro",
            quota_reset_date_utc: "2026-04-01T00:00:00.000Z",
            quota_snapshots: {
              premium_interactions: {
                entitlement: 300,
                remaining: 120,
                percent_remaining: 40,
                overage_permitted: true,
                overage_count: 0,
                unlimited: false,
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    expect(usage).toMatchObject({
      status: "available",
      login: "octocat",
      plan: "Copilot Pro",
      entitlement: 300,
      remaining: 120,
      used: 180,
      overagePermitted: true,
      overageCount: 0,
      unlimited: false,
      resetAt: "2026-04-01T00:00:00.000Z",
    });
  });
});
