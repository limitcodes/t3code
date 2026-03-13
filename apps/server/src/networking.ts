const DEFAULT_LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_LOOPBACK_ORIGIN_HOSTS = ["localhost", "127.0.0.1", "::1"] as const;
const DESKTOP_APP_ORIGIN = "cut3://app";

function normalizeHost(host: string): string {
  return host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

function canonicalizeOrigin(value: string | URL): string {
  const parsed = typeof value === "string" ? new URL(value) : value;
  if (parsed.origin !== "null") {
    return parsed.origin;
  }
  if (parsed.host.length > 0) {
    return `${parsed.protocol}//${parsed.host}`;
  }
  return parsed.href.replace(/\/$/, "");
}

export function isWildcardHost(host: string | undefined): boolean {
  return host === "0.0.0.0" || host === "::" || host === "[::]";
}

export function formatHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) {
    return false;
  }

  const normalized = normalizeHost(host);
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

export function buildAllowedWebSocketOrigins(params: {
  host: string | undefined;
  port: number;
  devUrl: URL | undefined;
  authToken: string | undefined;
  mode?: "web" | "desktop";
}): ReadonlySet<string> {
  const origins = new Set<string>();

  const addOrigin = (value: string | URL | undefined) => {
    if (!value) {
      return;
    }

    try {
      origins.add(canonicalizeOrigin(value));
    } catch {
      // Ignore malformed origins here and reject them during handshake validation.
    }
  };

  for (const loopbackHost of DEFAULT_LOOPBACK_ORIGIN_HOSTS) {
    addOrigin(`http://${formatHostForUrl(loopbackHost)}:${params.port}`);
    addOrigin(`https://${formatHostForUrl(loopbackHost)}:${params.port}`);
  }

  if (
    params.host &&
    !isWildcardHost(params.host) &&
    (params.authToken !== undefined || isLoopbackHost(params.host))
  ) {
    addOrigin(`http://${formatHostForUrl(params.host)}:${params.port}`);
    addOrigin(`https://${formatHostForUrl(params.host)}:${params.port}`);
  }

  addOrigin(params.devUrl);
  if (params.mode === "desktop") {
    origins.add(DESKTOP_APP_ORIGIN);
  }
  return origins;
}

export function isAllowedWebSocketOrigin(params: {
  originHeader: string | undefined;
  allowedOrigins: ReadonlySet<string>;
  allowMissingOrigin: boolean;
  allowNullOrigin: boolean;
}): boolean {
  const { originHeader, allowedOrigins, allowMissingOrigin, allowNullOrigin } = params;
  if (!originHeader) {
    return allowMissingOrigin;
  }
  if (originHeader === "null") {
    return allowNullOrigin;
  }

  try {
    return allowedOrigins.has(canonicalizeOrigin(originHeader));
  } catch {
    return false;
  }
}

export { DEFAULT_LOOPBACK_HOST };
