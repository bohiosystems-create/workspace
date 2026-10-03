// The ▶ Play presentation as a PowerPoint file (.pptx), in Kinan's collateral style: white slides with the orange
// rule and chevron, charcoal dividers, the Kinan logo, and NATIVE PowerPoint charts (columns with the target line,
// donuts, bars, lines) so the numbers stay editable. Each slide's narration goes into its speaker notes.
// Runs in the browser (pptxgenjs), the same deck JSON the player uses.
import type { Deck, DeckSlide } from "@/lib/deck";
import { kinanLogoHtml } from "@/lib/brand";

const OR = "F15A22", INK = "2E2E2F", TAUPE = "51473D", SOFT = "6F6F6F", GREY = "BCBEC0", TRACK = "EFEEEC", GOOD = "1F8A4C", BAD = "D03B3B", WARN = "D99400";
const SERIES = ["F15A22", "2A78D6", "1BAF7A", "EDA100", "E87BA4", "4A3AA7", "008300", "E34948"];
const W = 13.333, H = 7.5;

/** The Kinan logo (inline SVG) as a PNG data URI, for PowerPoint. */
async function logoPng(color: string, height = 120): Promise<string | null> {
  try {
    const svg = kinanLogoHtml(height, color);
    const m = svg.match(/width="(\d+)"/); const w = m ? Number(m[1]) : height * 3;
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes("xmlns") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement("canvas"); c.width = w; c.height = height;
    c.getContext("2d")!.drawImage(img, 0, 0, w, height);
    return c.toDataURL("image/png");
  } catch { return null; }
}

export async function deckToPptx(deck: Deck): Promise<Blob> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in, 16:9
  p.title = deck.title; p.company = "Kinan"; p.author = "AI Assistant Director of Marketing";
  const ar = deck.lang === "ar";
  if (ar) p.rtlMode = true;
  const FONT = ar ? "Arial" : "Montserrat";
  const align = ar ? "right" : "left";
  const [logoDark, logoWhite] = await Promise.all([logoPng("#2e2e2f"), logoPng("#ffffff")]);
  const logoRatio = 3.2; // width ÷ height of the Kinan wordmark (approx.)

  const T = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const total = deck.slides.length;
  const frame = (sl: any, n: number, dark = false) => {
    // Orange rule and chevron, logo and page number — the collateral frame.
    sl.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.08, fill: { color: OR }, line: { color: OR } });
    const logo = dark ? logoWhite : logoDark;
    if (logo) sl.addImage({ data: logo, x: ar ? 0.5 : W - 0.5 - 0.32 * logoRatio, y: H - 0.62, w: 0.32 * logoRatio, h: 0.32 });
    sl.addText(`${n} / ${total}`, { x: ar ? W - 1.6 : 0.5, y: H - 0.6, w: 1.1, h: 0.3, fontFace: FONT, fontSize: 9, color: dark ? "BBBBBB" : SOFT, align: ar ? "right" : "left" });
  };
  const kicker = (sl: any, text: string, dark = false) => {
    sl.addText(ar ? `${T(text)}  ‹` : `›  ${T(text)}`, { x: 0.6, y: 0.35, w: W - 1.2, h: 0.4, fontFace: FONT, fontSize: 12, bold: true, color: OR, charSpacing: ar ? 0 : 2, align });
    void dark;
  };
  const title = (sl: any, text: string, y = 0.8, size = 26, color = INK) =>
    sl.addText(T(text), { x: 0.6, y, w: W - 1.2, h: 0.9, fontFace: FONT, fontSize: size, bold: true, color, align, valign: "top", fit: "shrink" });
  const sub = (sl: any, text: string | undefined, y = 1.65, color = SOFT) => text && sl.addText(T(text), { x: 0.6, y, w: W - 1.2, h: 0.4, fontFace: FONT, fontSize: 12, color, align });
  const axis = { catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9, catAxisLabelColor: SOFT, valAxisLabelColor: SOFT, valGridLine: { color: "E6E5E2", size: 0.5 }, catGridLine: { style: "none" }, dataLabelFontFace: FONT, dataLabelFontSize: 10, dataLabelColor: INK, legendFontFace: FONT, legendFontSize: 10 };
  const chartBox = { x: 0.6, y: 2.15, w: W - 1.2, h: H - 3.0 };
  const fmt = (dec?: number) => (dec === 0 ? "#,##0" : "#,##0.0");

  deck.slides.forEach((s: DeckSlide, idx) => {
    const n = idx + 1;
    const dark = s.kind === "cover" || s.kind === "divider" || s.kind === "closing";
    const sl = p.addSlide();
    sl.background = { color: dark ? INK : "FFFFFF" };
    if ("say" in s && s.say) sl.addNotes(T(s.say));
    switch (s.kind) {
      case "cover": case "closing": case "divider": {
        const logo = logoWhite;
        if (logo && s.kind !== "divider") sl.addImage({ data: logo, x: ar ? W - 0.8 - 0.6 * logoRatio : 0.8, y: 0.8, w: 0.6 * logoRatio, h: 0.6 });
        sl.addText(T(s.kicker), { x: 0.8, y: s.kind === "divider" ? 2.2 : 2.6, w: W - 1.6, h: 0.5, fontFace: FONT, fontSize: 14, bold: true, color: OR, align });
        sl.addText(T(s.title), { x: 0.8, y: s.kind === "divider" ? 2.75 : 3.15, w: W - 1.6, h: 1.4, fontFace: FONT, fontSize: s.kind === "divider" ? 40 : 36, bold: true, color: "FFFFFF", align, valign: "top", fit: "shrink" });
        if ("sub" in s && s.sub && s.sub !== s.kicker) sl.addText(T(s.sub), { x: 0.8, y: s.kind === "divider" ? 4.25 : 4.6, w: W - 1.6, h: 0.6, fontFace: FONT, fontSize: 15, color: "DDDDDD", align });
        // The chevron band of the dividers.
        sl.addText(ar ? "‹" : "›", { x: ar ? 0.4 : W - 1.6, y: H - 2.3, w: 1.2, h: 1.6, fontFace: FONT, fontSize: 110, bold: true, color: OR, align: "center" });
        frame(sl, n, true);
        break;
      }
      case "headline": {
        kicker(sl, s.kicker); title(sl, s.headline, 0.8, 24);
        const k = s.kpis.slice(0, 4), bw = (W - 1.2 - 0.3 * (k.length - 1)) / Math.max(1, k.length);
        k.forEach((x, i) => {
          const xx = ar ? W - 0.6 - bw - i * (bw + 0.3) : 0.6 + i * (bw + 0.3);
          sl.addShape(p.ShapeType.rect, { x: xx, y: 2.2, w: bw, h: 0.05, fill: { color: OR }, line: { color: OR } });
          sl.addText(T(x.label).toUpperCase(), { x: xx, y: 2.3, w: bw, h: 0.35, fontFace: FONT, fontSize: 9, bold: true, color: TAUPE, align, charSpacing: ar ? 0 : 1 });
          const v = `${x.prefix ?? ""}${typeof x.value === "number" ? x.value.toLocaleString("en-GB", { maximumFractionDigits: x.decimals ?? 0 }) : x.value}${x.suffix ?? ""}`;
          sl.addText(v, { x: xx, y: 2.65, w: bw, h: 0.75, fontFace: FONT, fontSize: 30, bold: true, color: x.tone === "bad" ? BAD : x.tone === "good" ? GOOD : INK, align });
          if (x.sub) sl.addText(T(x.sub), { x: xx, y: 3.4, w: bw, h: 0.35, fontFace: FONT, fontSize: 10, color: SOFT, align });
        });
        if (s.points.length) sl.addText(s.points.slice(0, 4).map((t) => ({ text: T(t), options: { bullet: { code: "25B8" }, color: INK, paraSpaceAfter: 6 } })), { x: 0.6, y: 4.1, w: W - 1.2, h: 2.4, fontFace: FONT, fontSize: 14, align, valign: "top", fit: "shrink" });
        frame(sl, n); break;
      }
      case "columns": {
        kicker(sl, s.kicker); title(sl, s.title); sub(sl, s.sub);
        const data: any[] = [{ name: T(s.sub) || "Actual", labels: s.labels, values: s.values }];
        const last = s.values.length - 1;
        const colors = s.values.map((_, i) => (i === last ? OR : INK));
        if (s.target?.some((x) => x != null)) {
          sl.addChart([{ type: p.ChartType.bar, data, options: { barDir: "col", chartColors: colors, barGapWidthPct: 60, showValue: true, dataLabelFormatCode: fmt(s.decimals), varyColors: true } },
            { type: p.ChartType.line, data: [{ name: ar ? "المستهدف" : "Target", labels: s.labels, values: s.target.map((x) => x ?? 0) }], options: { chartColors: [TAUPE], lineDataSymbol: "none", lineSize: 2, lineDash: "dash" } }] as any,
          { ...chartBox, ...axis, showLegend: true, legendPos: "t", valAxisLabelFormatCode: fmt(s.decimals) } as any);
        } else sl.addChart(p.ChartType.bar, data, { ...chartBox, ...axis, barDir: "col", chartColors: colors, varyColors: true, barGapWidthPct: 60, showValue: true, dataLabelFormatCode: fmt(s.decimals), valAxisLabelFormatCode: fmt(s.decimals), showLegend: false } as any);
        frame(sl, n); break;
      }
      case "line": {
        kicker(sl, s.kicker); title(sl, s.title); sub(sl, s.sub);
        sl.addChart(p.ChartType.line, [{ name: T(s.title), labels: s.labels, values: s.values }], { ...chartBox, ...axis, chartColors: [OR], lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 7, showValue: true, dataLabelPosition: "t", showLegend: false } as any);
        frame(sl, n); break;
      }
      case "hbars": {
        kicker(sl, s.kicker); title(sl, s.title); sub(sl, `${T(s.sub)}${s.bench != null ? ` · ${s.benchLabel ?? (ar ? "المعيار" : "benchmark")} ${s.bench}${s.unit === "%" ? "%" : ""}` : ""}`);
        const colors = s.values.map((v) => (s.bench != null && s.unit === "%" ? (v > s.bench ? BAD : OR) : OR));
        sl.addChart(p.ChartType.bar, [{ name: T(s.title), labels: [...s.labels].reverse(), values: [...s.values].reverse() }], { ...chartBox, ...axis, barDir: "bar", chartColors: [...colors].reverse(), varyColors: true, barGapWidthPct: 45, showValue: true, dataLabelFormatCode: s.unit === "%" ? "0.0\"%\"" : "#,##0.0", showLegend: false } as any);
        frame(sl, n); break;
      }
      case "donut": {
        kicker(sl, s.kicker); title(sl, s.title); sub(sl, s.sub);
        sl.addChart(p.ChartType.doughnut, [{ name: T(s.title), labels: s.labels, values: s.values }], { x: 0.6, y: 2.1, w: W - 1.2, h: H - 2.9, holeSize: 55, chartColors: SERIES, showLegend: true, legendPos: ar ? "l" : "r", legendFontFace: FONT, legendFontSize: 12, showPercent: true, showValue: false, dataLabelColor: "FFFFFF", dataLabelFontSize: 11, dataLabelFontFace: FONT } as any);
        frame(sl, n); break;
      }
      case "gauges": {
        kicker(sl, s.kicker); title(sl, s.title);
        const it = s.items.slice(0, 4), gw = (W - 1.2) / Math.max(1, it.length);
        it.forEach((g, i) => {
          const x = ar ? W - 0.6 - gw * (i + 1) : 0.6 + gw * i, pct = Math.max(0, Math.min(100, g.pct));
          const col = g.pct >= 95 ? GOOD : g.pct >= 75 ? WARN : BAD;
          sl.addChart(p.ChartType.doughnut, [{ name: g.label, labels: ["", ""], values: [pct, 100 - pct] }], { x: x + 0.2, y: 1.9, w: gw - 0.4, h: 2.6, holeSize: 72, chartColors: [col, TRACK], showLegend: false, showValue: false, showPercent: false, showLabel: false } as any);
          sl.addText(`${Math.round(g.pct)}%`, { x: x + 0.2, y: 2.85, w: gw - 0.4, h: 0.6, fontFace: FONT, fontSize: 24, bold: true, color: col, align: "center" });
          sl.addText(T(g.label), { x, y: 4.55, w: gw, h: 0.4, fontFace: FONT, fontSize: 13, bold: true, color: INK, align: "center" });
          sl.addText(`${g.actual} / ${g.target}`, { x, y: 4.95, w: gw, h: 0.35, fontFace: FONT, fontSize: 11, color: SOFT, align: "center" });
          if (g.note) sl.addText(T(g.note), { x, y: 5.3, w: gw, h: 0.6, fontFace: FONT, fontSize: 10, color: SOFT, align: "center", fit: "shrink" });
        });
        if (s.foot) sub(sl, s.foot, H - 1.2);
        frame(sl, n); break;
      }
      case "scan": {
        kicker(sl, s.kicker); title(sl, s.title);
        const rows = [[ar ? "المصدر" : "Source", ar ? "سجلات فُحصت" : "Items scanned", ar ? "نتائج" : "Findings"], ...s.sources.map((x) => [T(x.label), x.items.toLocaleString("en"), String(x.found)])];
        sl.addTable(rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0 || j === 2, color: i === 0 ? "FFFFFF" : j === 2 && Number(c) > 0 ? OR : INK, fill: { color: i === 0 ? INK : i % 2 ? "FFFFFF" : "F7F6F4" }, align: j === 0 ? align : "center" } }))) as any,
          { x: 0.6, y: 2.0, w: W - 1.2, colW: [(W - 1.2) * 0.5, (W - 1.2) * 0.25, (W - 1.2) * 0.25], fontFace: FONT, fontSize: 12, border: { type: "solid", color: "E6E5E2", pt: 0.5 }, rowH: 0.38 } as any);
        frame(sl, n); break;
      }
      case "finding": {
        kicker(sl, `${s.kicker} · ${s.n}/${s.of}`); title(sl, s.title, 0.8, 22);
        sl.addText(T(s.source), { x: 0.6, y: 1.75, w: 3, h: 0.32, fontFace: FONT, fontSize: 10, bold: true, color: s.down ? BAD : GOOD, align });
        sl.addText(T(s.why), { x: 0.6, y: 2.15, w: s.series?.length ? 6.2 : W - 1.2, h: 2.8, fontFace: FONT, fontSize: 14, color: INK, align, valign: "top", fit: "shrink" });
        if (s.series && s.series.length > 3) sl.addChart(p.ChartType.line, [{ name: T(s.title), labels: s.series.map((_, i) => String(i + 1)), values: s.series }], { x: ar ? 0.6 : 7.1, y: 2.1, w: 5.6, h: 3.1, ...axis, chartColors: [s.down ? BAD : GOOD], lineSize: 3, lineDataSymbol: "none", showLegend: false, catAxisHidden: true } as any);
        if (s.evidence.length) sl.addText(s.evidence.slice(0, 3).map((e) => ({ text: `${T(e.source)}: ${T(e.title)}`, options: { bullet: { code: "21B3" }, color: SOFT } })), { x: 0.6, y: 5.3, w: W - 1.2, h: 1.2, fontFace: FONT, fontSize: 11, align, valign: "top", fit: "shrink" });
        frame(sl, n); break;
      }
      case "initiative": {
        kicker(sl, `${s.kicker} · ${s.n}/${s.of}`); title(sl, s.title, 0.8, 22);
        sl.addText(`${T(s.type)}${s.project ? ` · ${T(s.project)}` : ""}${s.answers ? ` · ${ar ? "يستجيب لـ" : "answers"}: ${T(s.answers)}` : ""}`, { x: 0.6, y: 1.7, w: W - 1.2, h: 0.35, fontFace: FONT, fontSize: 11, color: TAUPE, align, fit: "shrink" });
        sl.addText([{ text: T(s.idea), options: { color: INK, paraSpaceAfter: 8 } }, { text: `${ar ? "العرض" : "Offer"}: ${T(s.offer)}`, options: { color: SOFT, fontSize: 12 } }], { x: ar ? 5.6 : 0.6, y: 2.15, w: 7.1, h: 3.1, fontFace: FONT, fontSize: 14, align, valign: "top", fit: "shrink" });
        if (s.channels.length) sl.addChart(p.ChartType.doughnut, [{ name: "mix", labels: s.channels.map((c) => T(c.label)), values: s.channels.map((c) => c.pct) }], { x: ar ? 0.5 : 8.0, y: 2.0, w: 4.8, h: 3.2, holeSize: 55, chartColors: SERIES, showLegend: true, legendPos: "b", legendFontFace: FONT, legendFontSize: 10, showPercent: true, dataLabelColor: "FFFFFF", dataLabelFontSize: 10 } as any);
        const k = [[ar ? "الإنفاق" : "Spend", `SAR ${Math.round(s.spendK)}K`], [ar ? "العقود" : "Contracts", `${s.contracts[0]}–${s.contracts[1]}`], [ar ? "المبيعات" : "Sales", `SAR ${s.salesM[0]}–${s.salesM[1]}M`], [ar ? "التكلفة إلى المبيعات" : "Cost to sales", `${s.cts}%`]];
        k.forEach(([l, v], i) => { const bw = (W - 1.2 - 0.9) / 4, xx = ar ? W - 0.6 - bw - i * (bw + 0.3) : 0.6 + i * (bw + 0.3);
          sl.addShape(p.ShapeType.rect, { x: xx, y: 5.45, w: bw, h: 0.04, fill: { color: OR }, line: { color: OR } });
          sl.addText(l.toUpperCase(), { x: xx, y: 5.52, w: bw, h: 0.3, fontFace: FONT, fontSize: 9, bold: true, color: TAUPE, align });
          sl.addText(v, { x: xx, y: 5.8, w: bw, h: 0.5, fontFace: FONT, fontSize: 18, bold: true, color: INK, align }); });
        frame(sl, n); break;
      }
      case "list": {
        kicker(sl, s.kicker); title(sl, s.title, 0.8, 24);
        const tone = (t?: string) => (t === "bad" ? BAD : t === "warn" ? WARN : t === "good" ? GOOD : OR);
        const items = s.items.slice(0, 7);
        sl.addText(items.flatMap((x) => [
          { text: `${T(x.text)}${x.minutes ? `  ·  ~${x.minutes} ${ar ? "د" : "min"}` : ""}`, options: { bullet: { code: "25A0" }, color: INK, bold: true, fontSize: 15, breakLine: true, paraSpaceBefore: 6 } },
          ...(x.sub ? [{ text: T(x.sub), options: { color: SOFT, fontSize: 11.5, indentLevel: 1, breakLine: true } }] : []),
        ]) as any, { x: 0.6, y: 1.85, w: W - 1.2, h: H - 2.7, fontFace: FONT, align, valign: "top", fit: "shrink" });
        // Coloured markers for the tone of each item are carried by the bullet colour of the first run.
        void tone;
        if (s.totalMinutes) sub(sl, ar ? `المجموع: نحو ${s.totalMinutes} دقيقة` : `About ${s.totalMinutes} minutes in total`, H - 1.15);
        frame(sl, n); break;
      }
      default: { // any future slide kind: its title and narration
        const x: any = s; kicker(sl, x.kicker ?? ""); title(sl, x.title ?? x.headline ?? "");
        if (x.say) sl.addText(T(x.say), { x: 0.6, y: 2.0, w: W - 1.2, h: 4, fontFace: FONT, fontSize: 14, color: INK, align, valign: "top", fit: "shrink" });
        frame(sl, n);
      }
    }
  });
  return (await p.write({ outputType: "blob" })) as Blob;
}
