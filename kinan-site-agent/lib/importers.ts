import type { Activity, Db, DrawingSheet } from "./types";
import { col, parseCsv, parseDate } from "./csv";
import { resolveLocation } from "./core/query";

const yes = (v: string) => /^(y|yes|true|1|critical)$/i.test(v.trim());

/** Import a programme exported from Primavera P6 / MS Project as CSV. Replaces the schedule. */
export function importSchedule(db: Db, csv: string, dataDate?: string): { imported: number; skipped: number; unmappedLocations: number } {
  const rows = parseCsv(csv);
  const out: Activity[] = [];
  let skipped = 0, unmapped = 0;
  for (const r of rows) {
    const id = col(r, "activity id", "task_code", "id", "unique id");
    const name = col(r, "activity name", "task_name", "name", "task name");
    const start = parseDate(col(r, "actual start", "start", "forecast start", "early start"));
    const finish = parseDate(col(r, "actual finish", "finish", "forecast finish", "early finish"));
    if (!id || !name || !start || !finish) { skipped++; continue; }
    const locText = col(r, "location", "area", "zone", "building");
    let loc = locText ? resolveLocation(db, locText) : undefined;
    if (!loc) {
      // No location column: infer from the leading words of the name ("Tower A L13 slab…", "Podium atrium…").
      const words = name.replace(/[—–-].*$/, "").split(/\s+/);
      for (let n = Math.min(4, words.length); n >= 1 && !loc; n--) loc = resolveLocation(db, words.slice(0, n).join(" "));
    }
    if (!loc) unmapped++;
    const pct = Number(col(r, "% complete", "physical % complete", "activity % complete", "percent complete", "percent").replace("%", "")) || 0;
    out.push({
      id, name, wbs: col(r, "wbs", "wbs code", "outline number"), locationId: loc?.id ?? "site",
      trade: col(r, "trade", "discipline", "activity type") || "General", contractor: col(r, "responsible", "contractor", "resource", "resource names") || "",
      start, finish,
      baselineStart: parseDate(col(r, "bl project start", "baseline start", "bl start")) ?? start,
      baselineFinish: parseDate(col(r, "bl project finish", "baseline finish", "bl finish")) ?? finish,
      percent: Math.max(0, Math.min(100, pct)),
      status: pct >= 100 ? "completed" : pct > 0 ? "in_progress" : "not_started",
      critical: yes(col(r, "critical", "is critical")),
      totalFloat: Number(col(r, "total float", "total slack").replace(/[^\d.-]/g, "")) || 0,
      predecessors: col(r, "predecessors", "predecessor").split(/[,;]/).map((p) => p.trim().replace(/[:\s].*$/, "")).filter(Boolean),
      milestone: yes(col(r, "milestone")) || start === finish,
    });
  }
  if (out.length) {
    db.data.schedule = out;
    db.data.meta.dataDate = dataDate ?? new Date().toISOString().slice(0, 10);
  }
  return { imported: out.length, skipped, unmappedLocations: unmapped };
}

/** Import / update the drawing register from a document-control CSV export. Upserts by sheet number. */
export function importRegister(db: Db, csv: string): { upserted: number; skipped: number } {
  let n = 0, skipped = 0;
  for (const r of parseCsv(csv)) {
    const sheet = col(r, "sheet", "drawing number", "document number", "number");
    if (!sheet) { skipped++; continue; }
    const loc = resolveLocation(db, col(r, "location", "area", "building", "level"));
    const revision = col(r, "revision", "rev");
    const issued = parseDate(col(r, "issued", "date", "revision date")) ?? new Date().toISOString().slice(0, 10);
    const existing = db.data.register.find((s) => s.sheet === sheet);
    const status = (col(r, "status", "suitability") || "IFC") as DrawingSheet["status"];
    if (existing) {
      if (revision && revision !== existing.revision) existing.history.push({ revision, issued, reason: col(r, "reason", "description of change") || "Imported revision" });
      Object.assign(existing, { title: col(r, "title") || existing.title, revision: revision || existing.revision, status, issued, ...(loc ? { locationId: loc.id } : {}) });
    } else {
      db.data.register.push({ sheet, title: col(r, "title") || sheet, discipline: (col(r, "discipline") || "ARC").toUpperCase() as DrawingSheet["discipline"], locationId: loc?.id ?? "site", revision: revision || "A", status, issued, history: [{ revision: revision || "A", issued, reason: "Imported" }] });
    }
    n++;
  }
  return { upserted: n, skipped };
}
