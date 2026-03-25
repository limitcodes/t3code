import { describe, expect, it } from "vitest";

import {
  DESKTOP_BACKEND_READY_PREFIX,
  collectSmokeTestFailures,
  createSmokeTestChildEnv,
  createSmokeTestElectronArgs,
  parseDesktopBackendReadyPort,
} from "./smoke-test-lib.mjs";

describe("parseDesktopBackendReadyPort", () => {
  it("parses the raw desktop backend ready line", () => {
    expect(parseDesktopBackendReadyPort(`${DESKTOP_BACKEND_READY_PREFIX}{"port":3773}`)).toBe(3773);
  });

  it("parses the main-process bootstrap backend-ready log line", () => {
    expect(
      parseDesktopBackendReadyPort(
        "[2026-03-17T03:07:16.950Z] [desktop run=test] bootstrap backend ready port=39045",
      ),
    ).toBe(39045);
  });

  it("returns null for unrelated or malformed lines", () => {
    expect(parseDesktopBackendReadyPort("hello world")).toBeNull();
    expect(parseDesktopBackendReadyPort(`${DESKTOP_BACKEND_READY_PREFIX}{}`)).toBeNull();
    expect(parseDesktopBackendReadyPort(`${DESKTOP_BACKEND_READY_PREFIX}{"port":0}`)).toBeNull();
  });
});

describe("createSmokeTestChildEnv", () => {
  it("removes VITE_DEV_SERVER_URL and enables Electron logging", () => {
    expect(
      createSmokeTestChildEnv({
        PATH: "/usr/bin",
        VITE_DEV_SERVER_URL: "http://localhost:5733",
      }),
    ).toEqual({
      PATH: "/usr/bin",
      ELECTRON_ENABLE_LOGGING: "1",
    });
  });
});

describe("createSmokeTestElectronArgs", () => {
  it("adds --no-sandbox for Linux CI smoke runs", () => {
    expect(
      createSmokeTestElectronArgs({
        env: { CI: "true" },
        mainEntryPath: "dist-electron/main.js",
        platform: "linux",
      }),
    ).toEqual(["--no-sandbox", "dist-electron/main.js"]);
  });

  it("keeps local Linux smoke runs sandboxed", () => {
    expect(
      createSmokeTestElectronArgs({
        env: {},
        mainEntryPath: "dist-electron/main.js",
        platform: "linux",
      }),
    ).toEqual(["dist-electron/main.js"]);
  });
});

describe("collectSmokeTestFailures", () => {
  it("captures fatal renderer errors", () => {
    expect(collectSmokeTestFailures("Uncaught Error: renderer exploded")).toEqual([
      "Uncaught Error",
    ]);
  });

  it("ignores non-fatal node-pty fallback module errors", () => {
    expect(
      collectSmokeTestFailures(
        [
          "innerError Error: Cannot find module '../build/Debug/pty.node'",
          "code: 'MODULE_NOT_FOUND'",
          "[terminal] Falling back because node-pty failed to load.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });
});
