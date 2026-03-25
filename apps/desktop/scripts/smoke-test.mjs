import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectSmokeTestFailures,
  createSmokeTestChildEnv,
  createSmokeTestElectronArgs,
  DESKTOP_BACKEND_READY_PREFIX,
  FORCE_KILL_DELAY_MS,
  parseDesktopBackendReadyPort,
  READY_SETTLE_MS,
  READY_TIMEOUT_MS,
} from "./smoke-test-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");
const electronBin = resolve(desktopDir, "node_modules/.bin/electron");
const mainJs = resolve(desktopDir, "dist-electron/main.js");

console.log("\nLaunching Electron smoke test...");

const smokeTestEnv = createSmokeTestChildEnv(process.env);
const child = spawn(
  electronBin,
  createSmokeTestElectronArgs({
    env: smokeTestEnv,
    mainEntryPath: mainJs,
  }),
  {
    stdio: ["pipe", "pipe", "pipe"],
    env: smokeTestEnv,
  },
);

let output = "";
let stdoutBuffer = "";
let backendReadyPort = null;
let timedOut = false;
let terminatedByHarness = false;
let forceKillTimer = null;

const requestChildExit = () => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  terminatedByHarness = true;
  child.kill("SIGTERM");

  if (forceKillTimer !== null) {
    return;
  }

  forceKillTimer = setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    child.kill("SIGKILL");
  }, FORCE_KILL_DELAY_MS);
  forceKillTimer.unref?.();
};

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output += text;
  stdoutBuffer += text;

  const lines = stdoutBuffer.split(/\r?\n/g);
  stdoutBuffer = lines.pop() ?? "";

  for (const line of lines) {
    const readyPort = parseDesktopBackendReadyPort(line);
    if (readyPort === null || backendReadyPort !== null) {
      continue;
    }

    backendReadyPort = readyPort;
    setTimeout(() => {
      requestChildExit();
    }, READY_SETTLE_MS).unref?.();
  }
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const timeout = setTimeout(() => {
  timedOut = true;
  requestChildExit();
}, READY_TIMEOUT_MS);

child.on("exit", (code, signal) => {
  clearTimeout(timeout);
  if (forceKillTimer !== null) {
    clearTimeout(forceKillTimer);
    forceKillTimer = null;
  }

  if (backendReadyPort === null) {
    const bufferedReadyPort = parseDesktopBackendReadyPort(stdoutBuffer);
    if (bufferedReadyPort !== null) {
      backendReadyPort = bufferedReadyPort;
    }
  }

  const failures = collectSmokeTestFailures(output);

  if (failures.length > 0) {
    console.error("\nDesktop smoke test failed:");
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    console.error("\nFull output:\n" + output);
    process.exit(1);
  }

  if (timedOut) {
    console.error("\nDesktop smoke test failed: backend did not become ready in time.");
    console.error(
      `Expected a ${DESKTOP_BACKEND_READY_PREFIX} payload within ${READY_TIMEOUT_MS}ms.`,
    );
    console.error("\nFull output:\n" + output);
    process.exit(1);
  }

  if (backendReadyPort === null) {
    console.error(
      `\nDesktop smoke test failed: desktop backend readiness marker was not observed (code=${code ?? "null"} signal=${signal ?? "null"}).`,
    );
    console.error("\nFull output:\n" + output);
    process.exit(1);
  }

  if (!terminatedByHarness && code !== 0) {
    console.error(
      `\nDesktop smoke test failed: Electron exited unexpectedly after backend readiness (code=${code ?? "null"} signal=${signal ?? "null"}).`,
    );
    console.error("\nFull output:\n" + output);
    process.exit(1);
  }

  console.log(`Desktop smoke test passed (backend ready on port ${backendReadyPort}).`);
  process.exit(0);
});
