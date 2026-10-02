// Turn the emailed report (a full HTML document, English or Arabic) into an A4 PDF in the browser: the report is laid
// out off-screen at email width, captured as an image (so Arabic shaping and right-to-left layout come out exactly as
// the browser draws them), and split across pages.
// The Claude app edition (a claude.ai artifact) loads the two libraries from jsDelivr when the button is clicked,
// which keeps the page small; the app and the offline demo bundle them.
const CDN = { jspdf: "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js", h2c: "https://cdn.jsdelivr.net/npm/html2canvas-pro@2.5.0/dist/html2canvas-pro.min.js" };
const script = (src: string) => new Promise<void>((ok, fail) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const s = document.createElement("script");
  s.src = src; s.onload = () => ok(); s.onerror = () => fail(new Error("The PDF tools could not be loaded. Check the connection, or use Download HTML."));
  document.head.appendChild(s);
});
async function libs(): Promise<{ jsPDF: any; html2canvas: any }> {
  if (process.env.PDF_FROM_CDN === "1") {
    await Promise.all([script(CDN.jspdf), script(CDN.h2c)]);
    const w = window as any;
    return { jsPDF: w.jspdf?.jsPDF, html2canvas: w.html2canvas?.default ?? w.html2canvas };
  }
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas-pro")]);
  return { jsPDF, html2canvas };
}

export async function reportPdf(html: string): Promise<Blob> {
  const { jsPDF, html2canvas } = await libs();
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-12000px;top:0;width:760px;height:1200px;border:0;visibility:hidden";
  const loaded = new Promise((r) => (frame.onload = r));
  frame.srcdoc = html;
  document.body.appendChild(frame);
  try {
    await loaded;
    const doc = frame.contentDocument!;
    // Letter-spacing makes the capture draw Arabic letter by letter (unjoined); Arabic needs none.
    if (doc.documentElement.dir === "rtl" || /[\u0600-\u06FF]/.test(doc.body.textContent ?? "")) {
      const st = doc.createElement("style");
      st.textContent = "*{letter-spacing:0!important;word-spacing:normal!important}";
      doc.head.appendChild(st);
    }
    await (doc as any).fonts?.ready?.catch?.(() => null);
    const body = doc.body;
    // Page breaks go between blocks (paragraphs, list items, table rows, panels), never through a line of text.
    const scale = 2, top = body.getBoundingClientRect().top;
    const breaks = [...new Set([...body.querySelectorAll("p, li, tr, h1, h2, h3, h4, table, div, section")].map((el) => Math.round((el.getBoundingClientRect().bottom - top) * scale)))].sort((x, y) => x - y);
    const canvas = await html2canvas(body, { scale, backgroundColor: "#ffffff", width: 760, windowWidth: 760, height: body.scrollHeight, windowHeight: body.scrollHeight, logging: false });
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 28;
    const w = pw - 2 * m, sliceH = Math.floor((canvas.width * (ph - 2 * m)) / w);
    for (let y = 0, page = 0; y < canvas.height; page++) {
      // The lowest block end that fits on this page (at least 60% of a page, so a huge block still splits).
      const fit = breaks.filter((b) => b > y + sliceH * 0.6 && b <= y + sliceH).pop();
      const h = y + sliceH >= canvas.height ? canvas.height - y : (fit ?? y + sliceH) - y;
      const part = document.createElement("canvas");
      part.width = canvas.width; part.height = h;
      const ctx = part.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, part.width, h);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", m, m, w, (h * w) / canvas.width);
      y += h;
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}
