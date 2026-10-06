// Builds kinan-site-agent.html — the full app (same UI, agent core, routing and
// dataset) as ONE self-contained file. Usage: npm run build:html
import { build } from "esbuild";
import fs from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const res = await build({
  entryPoints: [root + "standalone/main.tsx"], bundle: true, write: false, minify: true, format: "iife",
  target: "es2020", jsx: "automatic", platform: "browser", logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_BRAND_LOGO": '""' },
  // Direct-to-Blob uploads only exist on Vercel deployments; never loaded here.
  external: ["@vercel/blob/client"],
  tsconfig: root + "tsconfig.json",
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync(root + "app/brand-fonts.css", "utf8") + fs.readFileSync(root + "app/globals.css", "utf8");
const icon = "data:image/svg+xml," + encodeURIComponent(fs.readFileSync(root + "public/icon.svg", "utf8"));
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1c1c1e"><meta name="apple-mobile-web-app-capable" content="yes">
<title>Kinan Onsite Agent</title><link rel="icon" href="${icon}">
<style>${css}</style></head>
<body><div id="root"><div class="boot">Kinan Onsite Agent</div></div>
<script>${js}</script></body></html>`;
fs.writeFileSync(root + "kinan-site-agent.html", html);
console.log("wrote kinan-site-agent.html", (html.length / 1024).toFixed(0) + " KB");

// --artifact <file>: the same app as a claude.ai Artifact page. The publisher adds the
// document skeleton and pads :root by the phone's safe areas, so: no doctype/head/body,
// title + style first, full-height layout from 100% (not dvh), no double safe-area padding.
const ai = process.argv.indexOf("--artifact");
if (ai > 0) {
  const out = process.argv[ai + 1];
  const fit = `
html,body,#root{height:100%}
.app{height:100%;max-width:none}
.top{padding-top:0}
.tabs{height:var(--tab);padding-bottom:0}
.viewer header{padding-top:8px}
.composer{padding-bottom:10px}`;
  const page = `<title>Kinan Onsite Agent</title>
<style>${css}${fit}</style>
<div id="root"><div class="boot">Kinan Onsite Agent</div></div>
<script>${js}</script>
`;
  fs.writeFileSync(out, page);
  console.log("wrote", out, (page.length / 1024).toFixed(0) + " KB");
}
