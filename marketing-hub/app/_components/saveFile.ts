// Save a generated file. Inside the Claude app (claude.ai artifact) a page cannot start downloads itself, so the
// artifact runtime's `downloads` capability asks the viewer to confirm; everywhere else a normal browser download.
export async function saveFile(filename: string, text: string, type: string) {
  const dl = await ((window as any).claude?.use?.("downloads") ?? Promise.resolve(null)).catch(() => null);
  if (dl) {
    try { await dl.save({ filename, data: text }); } catch (e: any) { if (e?.code !== "declined") throw new Error(e?.message ?? "The file could not be saved here."); }
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
