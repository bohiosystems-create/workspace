// Turn the e-mailed brief (a full HTML document, English or Arabic) into an A4 PDF in the browser — the same method as
// the Kinan marketing agent: the brief is laid out off-screen at e-mail width, captured as an image (so Arabic shaping
// and right-to-left layout come out exactly as the browser draws them), and split across pages between blocks.
export async function reportPdf(html: string): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas-pro")]);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-12000px;top:0;width:760px;height:1200px;border:0;visibility:hidden";
  const loaded = new Promise((r) => (frame.onload = r));
  frame.srcdoc = html.replace(/<script[^>]*id="kinan-deck"[\s\S]*?<\/script>/, "");
  document.body.appendChild(frame);
  try {
    await loaded;
    const doc = frame.contentDocument!;
    const still = doc.createElement("style");
    still.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
    doc.head.appendChild(still);
    // Letter-spacing makes the capture draw Arabic letter by letter (unjoined); Arabic needs none.
    if (doc.documentElement.dir === "rtl" || /[؀-ۿ]/.test(doc.body.textContent ?? "")) {
      const st = doc.createElement("style");
      st.textContent = "*{letter-spacing:0!important;word-spacing:normal!important}";
      doc.head.appendChild(st);
    }
    await (doc as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready?.catch?.(() => null);
    const body = doc.body;
    const scale = 2, top = body.getBoundingClientRect().top;
    const blocks = [...body.querySelectorAll("p, li, tr, h1, h2, h3, h4, table, div, section, figure, svg")].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round((r.top - top) * scale), bottom: Math.round((r.bottom - top) * scale) };
    });
    const canvas = await html2canvas(body, { scale, backgroundColor: "#ffffff", width: 760, windowWidth: 760, height: body.scrollHeight, windowHeight: body.scrollHeight, logging: false });
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 28;
    const w = pw - 2 * m, sliceH = Math.floor((canvas.width * (ph - 2 * m)) / w);
    // A break may not fall inside a compact block (a KPI row, a card): anything shorter than half a page stays whole.
    const compact = blocks.filter((k) => k.bottom - k.top < sliceH * 0.5);
    const breaks = [...new Set(blocks.map((k) => k.bottom))].filter((b) => !compact.some((k) => k.top < b - 2 && k.bottom > b + 2)).sort((x, y) => x - y);
    for (let y = 0, page = 0; y < canvas.height; page++) {
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
