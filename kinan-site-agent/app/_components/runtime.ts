"use client";
import type { Doc } from "@/lib/types";

/**
 * Small seam between the UI and where it runs:
 *  - server:     files come from /api/file, AI keys live in server env vars
 *  - standalone: single HTML file — files are blob/data URLs, keys entered in Settings
 */
export const runtime = {
  mode: "server" as "server" | "standalone",
  fileUrl: (doc: Pick<Doc, "id" | "revision">) => `/api/file?id=${encodeURIComponent(doc.id)}&v=${encodeURIComponent(doc.revision ?? "")}`,
};
