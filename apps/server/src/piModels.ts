import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";

export interface PiAvailableModel {
  readonly slug: string;
  readonly provider: string;
  readonly modelId: string;
  readonly name: string;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function killChildTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to direct kill.
    }
  }
  child.kill();
}

export function encodePiModelSlug(
  provider: string | undefined,
  modelId: string | undefined,
): string | undefined {
  const normalizedProvider = provider?.trim();
  const normalizedModelId = modelId?.trim();
  if (!normalizedModelId) {
    return undefined;
  }
  return normalizedProvider ? `${normalizedProvider}/${normalizedModelId}` : normalizedModelId;
}

export function parseAvailablePiModels(payload: unknown): ReadonlyArray<PiAvailableModel> {
  const data = asObject(payload);
  const models = Array.isArray(data?.models) ? data.models : [];
  const seen = new Set<string>();
  const parsed: PiAvailableModel[] = [];

  for (const entry of models) {
    const model = asObject(entry);
    const provider = asString(model?.provider)?.trim();
    const modelId = asString(model?.id)?.trim();
    if (!provider || !modelId) {
      continue;
    }

    const slug = encodePiModelSlug(provider, modelId);
    if (!slug || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    parsed.push({
      slug,
      provider,
      modelId,
      name: asString(model?.name)?.trim() || slug,
    });
  }

  return parsed;
}

export function resolvePiBinaryPath(binaryPath: string | undefined): string {
  const trimmed = binaryPath?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "pi";
}

export async function fetchAvailablePiModels(input?: {
  readonly binaryPath?: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
}): Promise<ReadonlyArray<PiAvailableModel>> {
  const child = spawn(resolvePiBinaryPath(input?.binaryPath), ["--mode", "rpc", "--no-session"], {
    cwd: input?.cwd ?? process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  return await new Promise<ReadonlyArray<PiAvailableModel>>((resolve, reject) => {
    const timeoutMs = input?.timeoutMs ?? 15_000;
    let settled = false;
    let stdoutBuffer = "";
    let lastStderrLine = "";

    const finalize = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.removeAllListeners();
      callback();
      killChildTree(child);
    };

    const timer = setTimeout(() => {
      finalize(() => {
        reject(new Error("Pi model probe timed out while waiting for RPC response."));
      });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;

      while (true) {
        const newlineIndex = stdoutBuffer.indexOf("\n");
        if (newlineIndex === -1) {
          return;
        }

        const rawLine = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        if (!line) {
          continue;
        }

        try {
          const payload = JSON.parse(line) as Record<string, unknown>;
          if (payload.type !== "response" || payload.command !== "get_available_models") {
            continue;
          }

          if (payload.success !== true) {
            const message = asString(payload.error)?.trim();
            finalize(() => {
              reject(
                new Error(
                  message && message.length > 0
                    ? message
                    : "Pi model probe failed to fetch available models.",
                ),
              );
            });
            return;
          }

          const models = parseAvailablePiModels(payload.data);
          finalize(() => {
            resolve(models);
          });
          return;
        } catch {
          // Ignore non-JSON lines and continue reading.
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const trimmed = chunk.trim();
      if (trimmed.length > 0) {
        lastStderrLine = trimmed.split("\n").at(-1)?.trim() ?? trimmed;
      }
    });

    child.once("error", (error) => {
      finalize(() => {
        reject(error);
      });
    });

    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }

      finalize(() => {
        reject(
          new Error(
            lastStderrLine ||
              (signal ? `Pi exited from signal ${signal}.` : "") ||
              (code !== null ? `Pi exited with code ${code}.` : "") ||
              "Pi exited before returning available models.",
          ),
        );
      });
    });

    child.stdin.write('{"type":"get_available_models"}\n');
  });
}
