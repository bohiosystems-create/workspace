/**
 * Generated projects, kept on this device (localStorage). Each holds the engine's result: the model spec, what it
 * read, warnings, and which documents went in.
 */
import type { ProjectModelSpec } from "./spec";

export type EngineId = "anthropic" | "openai" | "gemini" | "offline";
export interface GenResult { spec: ProjectModelSpec; warnings: string[]; engine: EngineId; model: string; ms: number; log: { step: string; detail: string }[]; tried: { engine: string; error: string }[]; route?: string }
export interface GenProject { id: string; createdAt: string; docs: string[]; result: GenResult }

const KEY = "kinan.projects.v1", OLD = "kinan.studio.v1";
export function loadProjects(): GenProject[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as GenProject[];
    // one-off: bring over the model made in the earlier 3D Studio tab
    const old = localStorage.getItem(OLD);
    if (old) {
      const r = JSON.parse(old) as GenResult;
      if (r?.spec?.buildings) list.unshift({ id: `p${Date.now().toString(36)}`, createdAt: new Date().toISOString(), docs: [], result: r });
      localStorage.removeItem(OLD); localStorage.setItem(KEY, JSON.stringify(list));
    }
    return Array.isArray(list) ? list.filter((p) => p?.result?.spec?.buildings) : [];
  } catch { return []; }
}
export function saveProjects(list: GenProject[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
