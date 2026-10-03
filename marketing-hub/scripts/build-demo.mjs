// Builds a single self-contained demo.html (no server, no DB, no API key).
//   npx tsx scripts/dump-data.ts && node scripts/build-demo.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
// node scripts/build-demo.mjs --claude-app  ->  demo-claude-app.html (to publish as an artifact on claude.ai)
const CLAUDE_APP = process.argv.includes("--claude-app");
const OUT = CLAUDE_APP ? "demo-claude-app.html" : "demo.html";
const shim = {
  name: "prisma-shim",
  setup(b) {
    b.onResolve({ filter: /^\.\/prisma$/ }, () => ({ path: path.join(root, "scripts/demo-prisma.ts") }));
    // The AI layer: none in the offline file; the claude.ai artifact runtime (`sample`) in the Claude app edition.
    b.onResolve({ filter: /^\.\/llm$/ }, () => ({ path: path.join(root, CLAUDE_APP ? "scripts/demo-llm-claude.ts" : "scripts/demo-llm.ts") }));
    if (CLAUDE_APP) b.onResolve({ filter: /^(jspdf|html2canvas-pro)$/ }, () => ({ path: path.join(root, "scripts/demo-empty.ts") }));
    b.onResolve({ filter: /^\.\/demo-llm$/ }, (a) => (CLAUDE_APP && a.importer.endsWith("demo-entry.tsx") ? { path: path.join(root, "scripts/demo-llm-claude.ts") } : undefined));
  },
};
const out = await build({
  entryPoints: [path.join(root, "scripts/demo-entry.tsx")],
  bundle: true, write: false, minify: true, format: "iife", jsx: "automatic",
  define: { "process.env.PDF_FROM_CDN": CLAUDE_APP ? '"1"' : '"0"', "process.env.NODE_ENV": '"production"', "process.env.ORACLE_MODE": '"mock"', "process.env.CRM_MODE": '"mock"', "process.env.ADS_MODE": '"mock"', "process.env.INGEST_API_KEY": "undefined", "process.env.OUTLOOK_SENDER_NAME_AR": "undefined", "process.env.OUTLOOK_MODE": '"mock"', "process.env.OUTLOOK_DELIVERY": '"send"', "process.env.OUTLOOK_SENDER": "undefined", "process.env.OUTLOOK_SENDER_NAME": '"Marketing Team"', "process.env.OUTLOOK_CC": "undefined", "process.env.KINAN_MODE": '"mock"', "process.env.YARDI_MODE": '"mock"', "process.env.KINAN_AGENT_WEBHOOK_URL": "undefined", "process.env.KINAN_WEBHOOK_SECRET": "undefined", "process.env.KINAN_API_KEY": "undefined", "process.env.REPORTS_CRON_KEY": "undefined", "process.env.REPORTS_ALLOWED_DOMAINS": "undefined", "process.env.META_MODE": '"mock"', "process.env.META_ACCESS_TOKEN": "undefined", "process.env.META_AD_ACCOUNT_IDS": "undefined", "process.env.META_API_VERSION": "undefined" }, plugins: [shim], loader: { ".json": "json" },
  alias: { "@": root },
});
const css = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/@import url\([^)]*\);/, "");
const js = out.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
// Claude app edition = a claude.ai artifact page: no document wrapper (the platform adds it), title and styles first,
// single (light) Bohio theme with explicit colours, safe-area padding kept, 16px gutters and no sideways scroll on phones.
const ARTIFACT_CSS = `:root{color-scheme:light}html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{background:var(--bg);color:var(--ink);overflow-x:hidden}
@media (max-width:600px){.shell{padding:20px 16px 72px}.topnav{flex-wrap:wrap}.navlinks{flex-wrap:wrap;max-width:100%}.panel,.row>*{min-width:0}table{display:block;overflow-x:auto;max-width:100%}}`;
if (CLAUDE_APP) writeFileSync(path.join(root, OUT), `<title>Kinan AI Assistant Director of Marketing</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Montserrat:wght@300;400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}
${ARTIFACT_CSS}</style>
<div id="root"></div><script>${js}</script>
`);
else writeFileSync(path.join(root, OUT), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kinan — AI Assistant Director of Marketing</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Montserrat:wght@300;400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
console.log(`wrote ${OUT}`);
