import { spawn } from "node:child_process";

export class CommandError extends Error {
  constructor(public cmd: string, public code: number | null, public stderr: string) {
    super(`${cmd} exited with ${code}: ${stderr.trim().split("\n").slice(-3).join(" / ")}`);
  }
}

/** Runs a program without a shell (arguments are never interpolated), returns stdout. */
export function run(cmd: string, args: string[], o: { cwd?: string; input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: o.cwd, env: o.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = o.timeoutMs ? setTimeout(() => p.kill("SIGTERM"), o.timeoutMs) : null;
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; if (err.length > 64_000) err = err.slice(-32_000); });
    p.on("error", (e) => { if (timer) clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(out); else reject(new CommandError(`${cmd} ${args.slice(0, 3).join(" ")}`, code, err));
    });
    if (o.input !== undefined) p.stdin.end(o.input); else p.stdin.end();
  });
}
