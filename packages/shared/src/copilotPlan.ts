const COPILOT_PLAN_LABELS = {
  free: "Copilot Free",
  copilot_free: "Copilot Free",
  individual_free: "Copilot Free",
  student: "Copilot Student",
  copilot_student: "Copilot Student",
  individual_student: "Copilot Student",
  pro: "Copilot Pro",
  copilot_pro: "Copilot Pro",
  individual_pro: "Copilot Pro",
  pro_plus: "Copilot Pro+",
  copilot_pro_plus: "Copilot Pro+",
  individual_pro_plus: "Copilot Pro+",
  business: "Copilot Business",
  copilot_business: "Copilot Business",
  enterprise: "Copilot Enterprise",
  copilot_enterprise: "Copilot Enterprise",
} as const satisfies Record<string, string>;

function titleCaseSegment(segment: string): string {
  const lower = segment.toLowerCase();
  if (lower === "pro+") return "Pro+";
  if (lower === "copilot") return "Copilot";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatGitHubCopilotPlan(plan: string | null | undefined): string | null {
  if (typeof plan !== "string") return null;

  const trimmed = plan.trim();
  if (trimmed.length === 0) return null;

  const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  const known = COPILOT_PLAN_LABELS[normalized as keyof typeof COPILOT_PLAN_LABELS];
  if (known) {
    return known;
  }

  return trimmed
    .replace(/\bpro(?:[\s_-]?plus)\b/gi, "pro+")
    .split(/[\s._/-]+/)
    .filter(Boolean)
    .map(titleCaseSegment)
    .join(" ");
}
