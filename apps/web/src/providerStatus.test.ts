import { describe, expect, it } from "vitest";

import { type ServerProviderStatus } from "@t3tools/contracts";

import {
  findProviderStatus,
  resolveProviderStatusForChat,
  resolveVisibleProviderStatusForChat,
} from "./providerStatus";

const PROVIDER_STATUSES: ServerProviderStatus[] = [
  {
    provider: "codex",
    status: "ready",
    available: true,
    authStatus: "authenticated",
    checkedAt: "2026-03-08T00:00:00.000Z",
  },
  {
    provider: "copilot",
    status: "warning",
    available: true,
    authStatus: "unknown",
    checkedAt: "2026-03-08T00:00:00.000Z",
    message: "Copilot warning",
  },
  {
    provider: "kimi",
    status: "error",
    available: false,
    authStatus: "unknown",
    checkedAt: "2026-03-08T00:00:00.000Z",
    message: "Kimi Code CLI (`kimi`) is not installed or not on PATH.",
  },
];

describe("findProviderStatus", () => {
  it("returns the matching provider status", () => {
    expect(findProviderStatus(PROVIDER_STATUSES, "kimi")).toEqual(PROVIDER_STATUSES[2]);
  });
});

describe("resolveProviderStatusForChat", () => {
  it("uses the selected provider before a session has started", () => {
    expect(
      resolveProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: null,
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
  });

  it("prefers the active session provider once a session exists", () => {
    expect(
      resolveProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "copilot",
      }),
    ).toEqual(PROVIDER_STATUSES[1]);
  });
});

describe("resolveVisibleProviderStatusForChat", () => {
  it("keeps the provider warning before a matching session starts", () => {
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: null,
        sessionStatus: null,
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
  });

  it("hides stale provider warnings once the matching session is ready", () => {
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "kimi",
        sessionStatus: "ready",
      }),
    ).toBeNull();
  });

  it("keeps warnings visible when the matching session is closed or failed", () => {
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "kimi",
        sessionStatus: "stopped",
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
    expect(
      resolveVisibleProviderStatusForChat({
        providerStatuses: PROVIDER_STATUSES,
        selectedProvider: "kimi",
        sessionProvider: "kimi",
        sessionStatus: "error",
      }),
    ).toEqual(PROVIDER_STATUSES[2]);
  });
});
