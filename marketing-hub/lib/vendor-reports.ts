// Vendor monthly report import (CSV). Vendors report in different shapes; this is the one canonical
// template every vendor fills in (or that a mapping script produces from their export).
import { prisma } from "./prisma";
import { ensureMarketingSeeded } from "./seed-marketing";
import { type Lang, tx } from "./i18n";

export const REPORT_COLUMNS = ["campaign_code", "month", "spend_sar", "leads", "qualified", "viewings", "reservations", "contracts", "sales_sar", "avg_response_hours"] as const;

/** Minimal CSV parser (comma-separated, double-quoted fields, header row). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) lines.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) lines.push(row);
  if (lines.length < 2) return [];
  const head = lines[0].map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => Object.fromEntries(head.map((h, i) => [h, (l[i] ?? "").trim()])));
}

export async function templateCsv() {
  await ensureMarketingSeeded();
  const cs = await prisma.campaign.findMany({ include: { months: true } });
  const rows = [REPORT_COLUMNS.join(",")];
  for (const c of cs) {
    const last = [...c.months].sort((a, b) => b.month.localeCompare(a.month))[0];
    if (c.crmCode && last) rows.push([c.crmCode, last.month, Math.round(last.spendK * 1000), last.leads, last.qualified, last.viewings, last.reservations, last.contracts, Math.round(last.revenueM * 1_000_000), last.respHrs].join(","));
  }
  return rows.join("\n") + "\n";
}

export type ImportResult = { accepted: number; created: number; updated: number; rejected: { line: number; reason: string }[] };

export async function importVendorReport(csv: string, fileName = "upload.csv", l: Lang = "en"): Promise<ImportResult> {
  await ensureMarketingSeeded();
  const rows = parseCsv(csv);
  const missing = REPORT_COLUMNS.filter((c) => !(rows[0] && c in rows[0]));
  if (rows.length === 0 || missing.length) throw new Error(missing.length ? tx(l, `Missing columns: ${missing.join(", ")}`, `أعمدة ناقصة: ${missing.join("، ")}`) : tx(l, "The file has no data rows.", "لا يحتوي الملف على أسطر بيانات."));
  const campaigns = await prisma.campaign.findMany({ include: { months: true } });
  const byCode = new Map(campaigns.filter((c) => c.crmCode).map((c) => [c.crmCode!.toLowerCase(), c]));
  const res: ImportResult = { accepted: 0, created: 0, updated: 0, rejected: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2;
    const c = byCode.get(r.campaign_code.toLowerCase());
    const num = (k: string) => Number(String(r[k]).replace(/[, ]/g, ""));
    const vals = { spend: num("spend_sar"), leads: num("leads"), qualified: num("qualified"), viewings: num("viewings"), reservations: num("reservations"), contracts: num("contracts"), sales: num("sales_sar"), resp: num("avg_response_hours") };
    if (!c) { res.rejected.push({ line, reason: tx(l, `unknown campaign_code "${r.campaign_code}"`, `رمز حملة غير معروف "${r.campaign_code}"`) }); continue; }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)) { res.rejected.push({ line, reason: tx(l, "month must be YYYY-MM", "يجب أن يكون الشهر بصيغة YYYY-MM") }); continue; }
    if (Object.values(vals).some((v) => !Number.isFinite(v) || v < 0)) { res.rejected.push({ line, reason: tx(l, "numbers must be non-negative", "يجب ألا تكون الأرقام سالبة") }); continue; }
    if (!(vals.leads >= vals.qualified && vals.qualified >= vals.viewings && vals.viewings >= vals.reservations && vals.reservations >= vals.contracts)) {
      res.rejected.push({ line, reason: tx(l, "funnel must narrow: leads ≥ qualified ≥ viewings ≥ reservations ≥ contracts", "يجب أن يتناقص المسار: العملاء المحتملون ≥ المؤهلون ≥ المعاينات ≥ الحجوزات ≥ العقود") }); continue;
    }
    const data = {
      spendK: vals.spend / 1000, leads: vals.leads, qualified: vals.qualified, viewings: vals.viewings, reservations: vals.reservations,
      contracts: vals.contracts, revenueM: vals.sales / 1_000_000, respHrs: vals.resp,
      impressionsK: 0, clicks: 0,
    };
    const ex = c.months.find((m) => m.month === r.month);
    if (ex) { await prisma.campaignMonth.update({ where: { id: ex.id }, data }); res.updated++; }
    else { await prisma.campaignMonth.create({ data: { ...data, campaignId: c.id, month: r.month } }); res.created++; }
    res.accepted++;
  }
  await prisma.sourceSync.create({ data: { source: "VENDOR_REPORT", mode: "upload", rows: res.accepted, rejected: res.rejected.length, note: fileName.slice(0, 120) } });
  return res;
}
