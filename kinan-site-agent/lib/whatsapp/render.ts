import path from "node:path";
import fs from "node:fs";
import type { Db } from "../types";
import { PLAN, SHAPES } from "../siteplan";
import { rootLocation } from "../core/query";

const STYLE = `
.ground{fill:#cfc8b3}.plot{fill:#efe9d8;stroke:#7a7051;stroke-width:1.5}.fence{fill:none;stroke:#4b5563;stroke-width:1;stroke-dasharray:6 4}
.zone{stroke-width:1;stroke-dasharray:10 5}.z1{fill:rgba(59,130,246,.06);stroke:#3b82f6}.z2{fill:rgba(34,197,94,.07);stroke:#16a34a}.z3{fill:rgba(245,158,11,.07);stroke:#d97706}
.road{fill:#6b7280}.public-road{fill:#4b5563}.cl{stroke:#f8fafc;stroke-width:1.2;stroke-dasharray:8 6;fill:none}
.bld{stroke:#334155;stroke-width:2}.res{fill:#c7d2e0}.ret{fill:#fbd9b5}.hot{fill:#e0cffa}.ame{fill:#b9f0c9}.villa{fill:#fdeab0;stroke-width:1.2}.util{fill:#dde3ea}.civic{fill:#b7ecd6}
.core{fill:#94a3b8;stroke:#1e293b}.col{fill:#334155}.unit{fill:none;stroke:#b45309;stroke-width:.8}.basement{fill:rgba(14,165,233,.05);stroke:#0284c7;stroke-width:1.8;stroke-dasharray:12 6}
.ramp{fill:#bae6fd;stroke:#0284c7}.pool{fill:#7dd3fc;stroke:#0284c7;stroke-width:.6}
.tmp{stroke:#78716c;stroke-width:1.2}.office{fill:#fde68a}.camp{fill:#fed7aa}.batch{fill:#d6d3d1}.yard{fill:#fef3c7;stroke-dasharray:5 3}.waste{fill:#d9f99d}
.cabin{fill:#fff7ed;stroke:#9a3412;stroke-width:.7}.bay{fill:#e5e7eb;stroke:#9ca3af;stroke-width:.4}.silo{fill:#a8a29e;stroke:#44403c}.wash{fill:#bfdbfe;stroke:#1d4ed8}
.crane-r{fill:rgba(234,88,12,.05);stroke:#ea580c;stroke-width:1;stroke-dasharray:8 5}.crane{fill:#ea580c;stroke:#fff;stroke-width:1.5}.hoist{fill:#fb923c;stroke:#7c2d12}.pump{fill:#fde047;stroke:#713f12}
.gate{fill:#16a34a;stroke:#fff}.guard{fill:#e5e7eb;stroke:#374151}.hse-pt{fill:#22c55e;stroke:#fff;stroke-width:1.5}
.tree{fill:#86efac;stroke:#15803d;stroke-width:.5}.garden{fill:#bbf7d0;stroke:#4ade80}.gridline{display:none}
.u-water,.u-sewer,.u-storm,.u-power,.u-tel,.u-fire,.mh,.lbl-u{display:none}
.sel{stroke:#f59e0b;stroke-width:6;fill-opacity:.9}
text{font-family:DejaVu Sans,Arial,sans-serif;paint-order:stroke;stroke:#fff;stroke-linejoin:round;text-anchor:middle}
.lbl-big{display:none}.lbl-b{font-weight:bold;fill:#0f172a}.lbl-zone{fill:#475569;font-weight:bold;text-anchor:start}.lbl-s{fill:#334155}.lbl-road{fill:#fff;stroke:#374151}
.lbl-c{fill:#9a3412;font-weight:bold}.lbl-gate,.lbl-h{fill:#fff;stroke:none;font-weight:bold}.lbl-grid{display:none}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Site plan crop around a place (or whole site), highlighted, as SVG for WhatsApp. */
export function planSvg(db: Db, locationId?: string, title?: string): string {
  const anchor = locationId ? (() => { const l = db.locations.find((x) => x.id === locationId); return l?.type === "level" ? rootLocation(db, locationId) : l; })() : undefined;
  let vx = 0, vy = 0, vw = PLAN.w, vh = PLAN.h;
  if (anchor?.x !== undefined && anchor.type !== "site") {
    vw = anchor.type === "zone" ? 900 : 520; vh = vw * 0.75;
    vx = Math.max(-40, Math.min(PLAN.w - vw + 40, anchor.x - vw / 2));
    vy = Math.max(-40, Math.min(PLAN.h - vh + 40, anchor.y! - vh / 2));
  }
  const W = 1200, scale = W / vw, z = PLAN.w / vw, H = Math.round(vh * scale);
  const sel = anchor?.id;
  const parts: string[] = [];
  for (const s of SHAPES) {
    const cls = s.cls + (s.loc && s.loc === sel ? " sel" : "");
    if (s.t === "text") {
      const d = s.detail ?? 1;
      if ((d === 2 && z < 1.5) || (d === 3 && z < 2.8)) continue;
      const px = Math.min(Math.max((s.size ?? 10) * (d === 1 ? 1.2 : 1.4), 11), 22);
      parts.push(`<text x="${s.x}" y="${s.y}" class="${cls}" font-size="${(px / scale).toFixed(2)}" stroke-width="${(3 / scale).toFixed(2)}">${esc(s.text ?? "")}</text>`);
    } else if (s.t === "rect") parts.push(`<rect class="${cls}" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"/>`);
    else if (s.t === "poly") parts.push(`<polygon class="${cls}" points="${s.pts!.map((p) => p.join(",")).join(" ")}"/>`);
    else if (s.t === "line") parts.push(`<polyline class="${cls}" fill="none" points="${s.pts!.map((p) => p.join(",")).join(" ")}"/>`);
    else parts.push(`<circle class="${cls}" cx="${s.cx}" cy="${s.cy}" r="${s.r}"/>`);
  }
  if (anchor?.x !== undefined) {
    const r = 1 / scale;
    parts.push(`<g transform="translate(${anchor.x} ${anchor.y}) scale(${r * 1.6})"><path d="M0,0 C-4,-8 -13,-13 -13,-22 A13,13 0 1 1 13,-22 C13,-13 4,-8 0,0Z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cy="-22" r="5" fill="#fff"/></g>`);
  }
  const banner = title ? `<g><rect x="${vx}" y="${vy}" width="${vw}" height="${46 / scale}" fill="#14213d" opacity=".92"/><text x="${vx + 14 / scale}" y="${vy + 31 / scale}" font-size="${22 / scale}" fill="#fff" stroke="none" style="text-anchor:start;font-weight:bold">${esc(title)}</text></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vx} ${vy} ${vw} ${vh}"><style>${STYLE}</style><rect x="-2000" y="-2000" width="6000" height="6000" class="ground"/>${parts.join("")}${banner}</svg>`;
}

/** SVG → PNG (white background). Uses @resvg/resvg-js; returns null if unavailable. */
export async function svgToPng(svg: string, width = 1600): Promise<Uint8Array | null> {
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    // Bundled fonts: serverless hosts (Vercel) have no system fonts, so text would vanish.
    const dir = path.join(process.cwd(), "assets", "fonts");
    const fontFiles = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
    const r = new Resvg(svg, { fitTo: { mode: "width", value: width }, background: "#ffffff", font: { fontFiles, loadSystemFonts: fontFiles.length === 0, defaultFontFamily: "DejaVu Sans" } });
    return new Uint8Array(r.render().asPng());
  } catch {
    return null;
  }
}
