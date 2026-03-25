export const DESKTOP_BACKEND_READY_PREFIX = "[cut3-desktop-ready]";
export const DESKTOP_BOOTSTRAP_READY_PATTERN = /bootstrap backend ready port=(\d+)/;
export const READY_TIMEOUT_MS = 15_000;
export const READY_SETTLE_MS = 1_500;
export const FORCE_KILL_DELAY_MS = 3_000;

const FATAL_PATTERNS = [
  "Refused to execute",
  "Uncaught Error",
  "Uncaught TypeError",
  "Uncaught ReferenceError",
];

export function parseDesktopBackendReadyPort(line) {
  const bootstrapMatch = line.match(DESKTOP_BOOTSTRAP_READY_PATTERN);
  if (bootstrapMatch?.[1]) {
    const port = Number.parseInt(bootstrapMatch[1], 10);
    if (Number.isInteger(port) && port >= 1 && port <= 65_535) {
      return port;
    }
  }

  const trimmed = line.trim();
  if (!trimmed.startsWith(DESKTOP_BACKEND_READY_PREFIX)) {
    return null;
  }

  const payloadText = trimmed.slice(DESKTOP_BACKEND_READY_PREFIX.length).trim();
  if (payloadText.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadText);
    if (typeof parsed.port !== "number" || !Number.isInteger(parsed.port)) {
      return null;
    }
    if (parsed.port < 1 || parsed.port > 65_535) {
      return null;
    }
    return parsed.port;
  } catch {
    return null;
  }
}

export function createSmokeTestChildEnv(env) {
  const childEnv = {
    ...env,
    ELECTRON_ENABLE_LOGGING: "1",
  };
  delete childEnv.VITE_DEV_SERVER_URL;
  return childEnv;
}

export function createSmokeTestElectronArgs({ env, mainEntryPath, platform = process.platform }) {
  const args = [mainEntryPath];
  const runningInCi = env.CI === "true" || env.GITHUB_ACTIONS === "true";
  if (platform === "linux" && runningInCi) {
    args.unshift("--no-sandbox");
  }
  return args;
}

export function collectSmokeTestFailures(output) {
  return FATAL_PATTERNS.filter((pattern) => output.includes(pattern));
}
