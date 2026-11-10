import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { MODES, type Mode, type Release } from "./policy";

export interface HistoryEntry {
  at: string;
  trigger: "manual" | "scheduled";
  from: string;
  to: string | null;
  result: "updated" | "rolledBack" | "failed" | "noChange";
  message?: string;
  backup?: string;
}

export interface State {
  mode: Mode;
  releases: Release[];
  feedAt: string | null;
  /** Versions already reported, so "available" goes out once per release. */
  announced: string[];
  history: HistoryEntry[];
}

const fresh = (mode: Mode): State => ({ mode, releases: [], feedAt: null, announced: [], history: [] });

export async function loadState(path: string, defaultMode: Mode): Promise<State> {
  try {
    const s = JSON.parse(await readFile(path, "utf8")) as Partial<State>;
    return {
      ...fresh(defaultMode),
      ...s,
      mode: MODES.includes(s.mode as Mode) ? (s.mode as Mode) : defaultMode,
      history: Array.isArray(s.history) ? s.history.slice(0, 50) : [],
      announced: Array.isArray(s.announced) ? s.announced.slice(-50) : [],
    };
  } catch {
    return fresh(defaultMode);
  }
}

/** Atomic write: a crash mid-write never leaves a half file behind. */
export async function saveState(path: string, s: State) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify({ ...s, history: s.history.slice(0, 50), announced: s.announced.slice(-50) }, null, 2));
  await rename(tmp, path);
}
