// Builds a single self-contained demo.html (no server, no DB, no API key).
//   npx tsx scripts/dump-data.ts && node scripts/build-demo.mjs
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const shim = {
  name: "prisma-shim",
  setup(b) {
    b.onResolve({ filter: /^\.\/prisma$/ }, () => ({ path: path.join(root, "scripts/demo-prisma.ts") }));
  },
};
const out = await build({
  entryPoints: [path.join(root, "scripts/demo-entry.tsx")],
  bundle: true, write: false, minify: true, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env.ORACLE_MODE": '"mock"', "process.env.CRM_MODE": '"mock"', "process.env.ADS_MODE": '"mock"', "process.env.INGEST_API_KEY": "undefined", "process.env.OUTLOOK_SENDER_NAME_AR": "undefined", "process.env.OUTLOOK_MODE": '"mock"', "process.env.OUTLOOK_DELIVERY": '"send"', "process.env.OUTLOOK_SENDER": "undefined", "process.env.OUTLOOK_SENDER_NAME": '"Marketing Team"', "process.env.OUTLOOK_CC": "undefined", "process.env.KINAN_MODE": '"mock"', "process.env.YARDI_MODE": '"mock"', "process.env.KINAN_AGENT_WEBHOOK_URL": "undefined", "process.env.KINAN_WEBHOOK_SECRET": "undefined", "process.env.KINAN_API_KEY": "undefined", "process.env.REPORTS_CRON_KEY": "undefined", "process.env.REPORTS_ALLOWED_DOMAINS": "undefined" }, plugins: [shim], loader: { ".json": "json" },
  alias: { "@": root },
});
const css = readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/@import url\([^)]*\);/, "");
const js = out.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
writeFileSync(path.join(root, "demo.html"), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bohio — Marketing Hub</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
console.log("wrote demo.html");
