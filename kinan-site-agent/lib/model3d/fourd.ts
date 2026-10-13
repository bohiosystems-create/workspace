/**
 * 4D project files — a project brought in ready-made instead of generated from documents.
 *
 *   Kinan 4D file (.kinan4d / .json): { format: "kinan-4d", version: 1, spec } — what the Studio's "Export 4D" writes,
 *     so a model can be moved between devices, checked and edited by hand, and loaded again exactly as it was.
 *   Any JSON already in the model's shape ({ buildings, schedule, … }) is accepted too, e.g. from another tool.
 *   IFC (.ifc, BIM in STEP text): too big to send whole, and its geometry is not needed — ifcDigest keeps the project,
 *     site, buildings, storeys with their elevations, spaces and quantities, and the 4D schedule (IfcWorkSchedule,
 *     IfcTask and its times, task → product links, task sequences), which the AI then turns into the model.
 * Everything goes through normalizeSpec, so a file can never break the 3D view.
 */
import { normalizeSpec, type ProjectModelSpec } from "./spec";

export const FOURD_FORMAT = "kinan-4d";
export const FOURD_EXT = /\.(kinan4d|json)$/i;
export const IFC_EXT = /\.ifc$/i;

/** The model as a Kinan 4D file. */
export function exportFourD(spec: ProjectModelSpec): string {
  return JSON.stringify({ format: FOURD_FORMAT, version: 1, exportedAt: new Date().toISOString(), spec }, null, 2);
}

/** A 4D file back into a model. Throws a plain-English error when the file is not one. */
export function importFourD(text: string, name: string): { spec: ProjectModelSpec; warnings: string[]; kind: string } {
  let raw: any;
  try { raw = JSON.parse(text.replace(/^﻿/, "")); } catch { throw new Error(`${name} is not a 4D file: it is not valid JSON.`); }
  const body = raw?.format === FOURD_FORMAT ? raw.spec : raw?.spec?.buildings ? raw.spec : raw;
  if (!body || !Array.isArray(body.buildings) || !body.buildings.length) throw new Error(`${name} has no buildings: a 4D file needs "buildings" and a "schedule" (export one from a project to see the format).`);
  const { spec, warnings } = normalizeSpec(body);
  return { spec, warnings, kind: raw?.format === FOURD_FORMAT ? `Kinan 4D file v${raw.version ?? 1}` : "4D JSON" };
}

// STEP entities that carry the building, its storeys and the 4D schedule (geometry and styling are left out).
const KEEP = /^#\d+\s*=\s*(IFCPROJECT|IFCSITE|IFCBUILDING|IFCBUILDINGSTOREY|IFCSPACE|IFCZONE|IFCWORKPLAN|IFCWORKSCHEDULE|IFCTASK|IFCTASKTIME|IFCTASKTIMERECURRING|IFCRELASSIGNSTOPRODUCT|IFCRELASSIGNSTOPROCESS|IFCRELSEQUENCE|IFCLAGTIME|IFCRELAGGREGATES|IFCRELNESTS|IFCRELDEFINESBYPROPERTIES|IFCELEMENTQUANTITY|IFCQUANTITYLENGTH|IFCQUANTITYAREA|IFCQUANTITYVOLUME|IFCPROPERTYSET|IFCPROPERTYSINGLEVALUE|IFCPOSTALADDRESS|IFCSIUNIT|IFCCONVERSIONBASEDUNIT|IFCLOCALPLACEMENT|IFCAXIS2PLACEMENT3D|IFCCARTESIANPOINT)\s*\(/i;
const PRIORITY = /^#\d+\s*=\s*(IFCPROJECT|IFCSITE|IFCBUILDING|IFCBUILDINGSTOREY|IFCWORKSCHEDULE|IFCTASK|IFCTASKTIME|IFCRELASSIGNSTOPRODUCT|IFCRELSEQUENCE|IFCRELAGGREGATES|IFCQUANTITY|IFCELEMENTQUANTITY|IFCSIUNIT)/i;

/** The part of an IFC file the AI needs, as text (well under the 4 MB upload limit). */
export function ifcDigest(text: string, max = 180_000): { text: string; kept: number; total: number; tasks: number; storeys: number } {
  const lines = text.split(/;\s*\r?\n/).map((l) => l.trim()).filter(Boolean);
  const data = lines.filter((l) => /^#\d+\s*=/.test(l));
  const header = (lines.find((l) => /^FILE_NAME|^FILE_SCHEMA/i.test(l)) ?? "").slice(0, 400);
  const first = data.filter((l) => PRIORITY.test(l)), rest = data.filter((l) => KEEP.test(l) && !PRIORITY.test(l));
  // placements and points only as far as the budget allows: they position the buildings, but there are many
  const out: string[] = []; let size = 0;
  for (const l of [...first, ...rest]) { if (size + l.length > max) break; out.push(l); size += l.length + 2; }
  const tasks = data.filter((l) => /=\s*IFCTASK\s*\(/i.test(l)).length, storeys = data.filter((l) => /=\s*IFCBUILDINGSTOREY\s*\(/i.test(l)).length;
  const note = `IFC DIGEST — ${out.length} of ${data.length} entities kept (spatial structure, quantities, 4D schedule); geometry left out.\n${header}\n`;
  return { text: note + out.join(";\n") + ";", kept: out.length, total: data.length, tasks, storeys };
}
