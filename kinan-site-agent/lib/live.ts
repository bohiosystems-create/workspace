import type { Db } from "./types";

/** The newest change to the shared data, in words: a site update, a note, an upload or a facility event. */
export function latestChange(db: Db): { at: string; text: string; via?: string } | null {
  const c: { at: string; text: string; via?: string }[] = [];
  const u = db.data?.updates?.[0];
  if (u) { const a = db.data.schedule.find((x) => x.id === u.activityId); c.push({ at: u.at, via: u.channel, text: `${u.by}: ${a?.name ?? u.activityId} — ${u.state === "completed" ? "completed" : u.state === "pending" ? "pending" : `${u.percent ?? ""}%`}` }); }
  const n = [...db.notes].sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
  if (n) c.push({ at: n.createdAt, via: n.via, text: `${n.author}: ${n.text.slice(0, 90)}` });
  const d = [...db.docs].filter((x) => x.uploadedAt).sort((x, y) => y.uploadedAt.localeCompare(x.uploadedAt))[0];
  if (d && !d.id.startsWith("d_seed")) c.push({ at: d.uploadedAt, text: `${d.uploadedBy}: filed “${d.title}”` });
  const f = db.fmLog?.[db.fmLog.length - 1];
  if (f) c.push({ at: f.at, via: f.channel, text: `${f.by}: ${f.summary}` });
  return c.sort((x, y) => y.at.localeCompare(x.at))[0] ?? null;
}
