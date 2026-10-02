// Builds kinan-site-agent.html — the full app (same UI, agent core, routing and
// dataset) as ONE self-contained file. Usage: npm run build:html
import { build } from "esbuild";
import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const res = await build({
  entryPoints: [root + "standalone/main.tsx"], bundle: true, write: false, minify: true, format: "iife",
  target: "es2020", jsx: "automatic", platform: "browser", logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"' },
  // Direct-to-Blob uploads only exist on Vercel deployments; never loaded here.
  external: ["@vercel/blob/client"],
  tsconfig: root + "tsconfig.json",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync(root + "app/globals.css", "utf8");
const icon = "data:image/svg+xml," + encodeURIComponent(fs.readFileSync(root + "public/icon.svg", "utf8"));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#14213d"><meta name="apple-mobile-web-app-capable" content="yes">
<title>Kinan Site Agent</title><link rel="icon" href="${icon}">
<style>${css}</style></head>
<body><div id="root"><div class="boot">Loading site…</div></div>
<script>${js}</script></body></html>`;
fs.writeFileSync(root + "kinan-site-agent.html", html);
console.log("wrote kinan-site-agent.html", (html.length / 1024).toFixed(0) + " KB");
