import { describe, expect, it } from "vitest";

import {
  buildAllowedWebSocketOrigins,
  formatHostForUrl,
  isAllowedWebSocketOrigin,
  isLoopbackHost,
  isLoopbackRemoteAddress,
  isWildcardHost,
} from "./networking";

describe("networking", () => {
  it("formats IPv6 hosts for URLs", () => {
    expect(formatHostForUrl("::1")).toBe("[::1]");
    expect(formatHostForUrl("127.0.0.1")).toBe("127.0.0.1");
  });

  it("distinguishes wildcard and loopback hosts", () => {
    expect(isWildcardHost("0.0.0.0")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("192.168.1.42")).toBe(false);
  });

  it("accepts loopback remote addresses including IPv4-mapped IPv6", () => {
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("::1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("192.168.1.42")).toBe(false);
  });

  it("does not trust arbitrary non-loopback origins when auth is disabled", () => {
    const allowedOrigins = buildAllowedWebSocketOrigins({
      host: "0.0.0.0",
      port: 3773,
      devUrl: undefined,
      authToken: undefined,
    });

    expect(
      isAllowedWebSocketOrigin({
        originHeader: "http://192.168.1.42:3773",
        allowedOrigins,
        allowMissingOrigin: false,
        allowNullOrigin: false,
      }),
    ).toBe(false);
    expect(
      isAllowedWebSocketOrigin({
        originHeader: "http://127.0.0.1:3773",
        allowedOrigins,
        allowMissingOrigin: false,
        allowNullOrigin: false,
      }),
    ).toBe(true);
  });

  it("allows the configured non-loopback origin once auth is enabled", () => {
    const allowedOrigins = buildAllowedWebSocketOrigins({
      host: "100.88.10.4",
      port: 3773,
      devUrl: undefined,
      authToken: "secret-token",
    });

    expect(
      isAllowedWebSocketOrigin({
        originHeader: "http://100.88.10.4:3773",
        allowedOrigins,
        allowMissingOrigin: true,
        allowNullOrigin: false,
      }),
    ).toBe(true);
  });

  it("allows the packaged desktop app origin in desktop mode", () => {
    const allowedOrigins = buildAllowedWebSocketOrigins({
      host: "127.0.0.1",
      port: 3773,
      devUrl: undefined,
      authToken: "secret-token",
      mode: "desktop",
    });

    expect(
      isAllowedWebSocketOrigin({
        originHeader: "cut3://app",
        allowedOrigins,
        allowMissingOrigin: true,
        allowNullOrigin: true,
      }),
    ).toBe(true);
  });
});
