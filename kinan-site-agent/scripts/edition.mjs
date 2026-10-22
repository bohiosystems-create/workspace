// Builds the vanilla edition of the Onsite Agent from this (Kinan) source: every use case — construction and the
// facility operations layer (lib/edition.ts) — with the Kinan brand replaced by a neutral, fictional developer
// ("Meridian"): names (English and Arabic), colours, logo and mark, no Kinan texture, sample packs re-written.
//
//   node scripts/edition.mjs vanilla <destination folder>
//
// The destination is a separate app (in the demo portal: bohio-demos/site-agent). Its own files are kept where this
// source has none: middleware.ts (the portal's sign-in gate), demo.json, node_modules, .next, data. Everything else is
// replaced. Run it again after each change to the source; the Kinan edition needs no step (it is the default).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [edition, destArg] = process.argv.slice(2);
if (edition !== "vanilla" || !destArg) { console.error("usage: node scripts/edition.mjs vanilla <destination folder>"); process.exit(2); }
const dest = path.resolve(destArg);
if (dest === root || dest.startsWith(root + path.sep)) { console.error("The destination must be outside this project."); process.exit(2); }

// The data's fictional developer, and the vendor whose look the app wears (the Bohio website: editions/vanilla/bohio).
const NAME = "Meridian", NAME_AR = "ميريديان", VENDOR = "Bohio";
const COLOURS = [ // Kinan orange → steel blue on paper and in the canvas scenes (the app's own screens take the Bohio theme's tokens)
  ["#f15a22", "#3b5570"], ["#d94a16", "#2c4157"], ["#d94a15", "#2c4157"], ["#fff1ea", "#e8eef4"], ["#fde3d8", "#dde6ee"], ["#f5b89a", "#a9b7c4"],
  ["#ff6a33", "#cfd9e3"], ["#ff7a45", "#e6eef3"], ["#ff6a37", "#e6eef3"], ["#1b0d04", "#000919"], ["#3d2217", "#1a2634"], ["#7a4126", "#3b5570"],
  ["0xf15a22", "0x3b5570"], ["241,90,34", "59,85,112"], ["241, 90, 34", "59, 85, 112"], ["255,106,51", "207,217,227"],
];
const RENAME = [ // order matters: specific before general
  ["kinan-site-agent", "site-agent"], ["Kinan Onsite Agent", `${VENDOR} Onsite Agent`], ["www.kinan.com.sa", "www.bohiotech.com"], ["kinan.com.sa", "bohiotech.com"],
  ["KINAN_", "APP_"], ["KH-", "MH-"], ["KB-", "MB-"], ["LIVE THE PLACE", "AUTOMATING WORKFLOWS. FROM INVESTMENT TO OPERATIONS."],
  ["كنان", NAME_AR], ["Kinan", NAME], ["KINAN", NAME.toUpperCase()], ["kinan", NAME.toLowerCase()],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const renameText = (s) => RENAME.reduce((t, [a, b]) => t.split(a).join(b), s);
/** Brand text and colours, outside long base64 runs (embedded images must not be touched). */
function transform(text) {
  return text.split(/([A-Za-z0-9+/=]{300,})/).map((part, i) => {
    if (i % 2) return part;
    let t = renameText(part);
    for (const [a, b] of COLOURS) t = t.replace(new RegExp(esc(a), "gi"), b);
    return t;
  }).join("");
}
const TEXT = /\.(ts|tsx|js|mjs|cjs|css|md|json|txt|csv|svg|html|yml|yaml|webmanifest|example)$|(^|\/)(Dockerfile|Caddyfile|\.gitignore|\.dockerignore)$/;
const SKIP = (f) => f === "kinan-site-agent.html" || f === "app/_components/KinanSplash.tsx" || f === "middleware.ts" || f.startsWith("editions/") || f.startsWith("brand/whatsapp/") || /texture\.jpg$/.test(f) || f === "kinan-site-agent-vercel.zip";

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root }).toString().split("\0").filter(Boolean).filter((f) => !SKIP(f));
// keep the destination's own files; remove what came from an earlier run so renamed or deleted files don't linger
const KEEP = new Set(["middleware.ts", "demo.json", ".env.production", "node_modules", ".next", "data", ".vercel"]);
if (fs.existsSync(dest)) for (const e of fs.readdirSync(dest)) if (!KEEP.has(e)) fs.rmSync(path.join(dest, e), { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

let n = 0;
for (const f of files) {
  const out = path.join(dest, renameText(f));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = fs.readFileSync(path.join(root, f));
  if (f.endsWith(".zip")) {
    // sample packs: the documents inside are re-written too
    const z = unzipSync(buf), o = {};
    for (const [name, data] of Object.entries(z)) o[renameText(name)] = TEXT.test(name) || /\.(md|csv|txt)$/i.test(name) ? strToU8(transform(strFromU8(data))) : data;
    fs.writeFileSync(out, zipSync(o, { level: 9 }));
  } else fs.writeFileSync(out, TEXT.test(f) ? transform(buf.toString("utf8")) : buf);
  n++;
}

// the Bohio look (editions/vanilla/bohio): the theme goes after the app's own styles, with the Dallas Light font and
// the faceted backdrop inlined (the single-file build carries them too); Libre Franklin comes from Google Fonts
const bohio = path.join(root, "editions", "vanilla", "bohio");
const dataUri = (f, mime) => `data:${mime};base64,${fs.readFileSync(path.join(bohio, f)).toString("base64")}`;
const theme = fs.readFileSync(path.join(bohio, "theme.css"), "utf8").replaceAll("__DALLAS__", dataUri("Dallas-Light.woff2", "font/woff2")).replaceAll("__FACETS__", dataUri("bohio-facets.svg", "image/svg+xml"));
const gcss = path.join(dest, "app", "globals.css");
fs.writeFileSync(gcss, `@import url("https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@300;400;500;600;700&display=swap");\n${fs.readFileSync(gcss, "utf8")}\n${theme}`);
const layout = path.join(dest, "app", "layout.tsx");
fs.writeFileSync(layout, fs.readFileSync(layout, "utf8").replace("family=Montserrat:", "family=Libre+Franklin:wght@300;400;500;600;700&family=Montserrat:").replace(/themeColor: "#2e2e2f"/, 'themeColor: "#000919"'));
const splash = path.join(dest, "app", "_components", `${NAME}Splash.tsx`);
fs.writeFileSync(splash, fs.readFileSync(path.join(bohio, "Splash.tsx"), "utf8"));
const manifest = path.join(dest, "public", "manifest.webmanifest");
fs.writeFileSync(manifest, fs.readFileSync(manifest, "utf8").replace(/#2e2e2f/g, "#000919"));
const sb = path.join(dest, "standalone", "build.mjs");
fs.writeFileSync(sb, fs.readFileSync(sb, "utf8").replace('theme-color" content="#1c1c1e"', 'theme-color" content="#000919"')
  // the single-file build is always this edition (esbuild does not read .env files)
  .replace(/JSON\.stringify\(process\.env\.NEXT_PUBLIC_EDITION === "vanilla" \? "vanilla" : "\w+"\)/, '\'"vanilla"\''));

// the brand: the Bohio wordmark (Dallas Light) and sun mark, no texture; the home-screen icon; the deck's embedded artwork
const vb = path.join(root, "editions", "vanilla", "brand");
const logo = fs.readFileSync(path.join(vb, "logo.svg"), "utf8"), mark = fs.readFileSync(path.join(vb, "mark.svg"), "utf8");
const lc = NAME.toLowerCase();
for (const dir of ["brand", "public/brand"]) {
  fs.mkdirSync(path.join(dest, dir), { recursive: true });
  fs.writeFileSync(path.join(dest, dir, `${lc}-logo.svg`), logo);
  fs.writeFileSync(path.join(dest, dir, `${lc}-chevron.svg`), mark);
}
const svgPath = (s) => ({ viewBox: /viewBox="([^"]+)"/.exec(s)[1], d: /\sd="([^"]+)"/.exec(s)[1] });
const L = svgPath(logo), M = svgPath(mark);
fs.writeFileSync(path.join(dest, "public", "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000919"/><svg x="18" y="14" width="28" height="35" viewBox="${M.viewBox}"><path fill="#cfd9e3" d="${M.d}"/></svg></svg>\n`);
const pfx = "APP";
fs.writeFileSync(path.join(dest, "lib", "deck", "brand-logo.ts"), `// Generated by scripts/edition.mjs from editions/vanilla/brand — do not edit.
export const ${pfx}_LOGO: string | null = ${JSON.stringify("data:image/svg+xml;base64," + Buffer.from(logo.replace("<svg ", '<svg width="270" height="60" ')).toString("base64"))};
export const ${pfx}_LOGO_PATH: string | null = ${JSON.stringify(L.d)};
export const ${pfx}_LOGO_VIEWBOX: string | null = ${JSON.stringify(L.viewBox)};
export const ${pfx}_CHEVRON_PATH: string | null = ${JSON.stringify(M.d)};
export const ${pfx}_CHEVRON_VIEWBOX: string | null = ${JSON.stringify(M.viewBox)};
export const ${pfx}_TEXTURE: string | null = null;
`);
// the edition switch, read at build time (also set as a Vercel variable by demo.json)
fs.writeFileSync(path.join(dest, ".env.production"), "# The vanilla edition: every use case, neutral brand (lib/edition.ts).\nNEXT_PUBLIC_EDITION=vanilla\n");
fs.writeFileSync(path.join(dest, ".env.development"), "NEXT_PUBLIC_EDITION=vanilla\n");
// re-embed the brand (lib/brand-assets.ts) from the new artwork
execFileSync(process.execPath, [path.join(dest, "scripts", "brand.mjs")], { cwd: dest, stdio: "inherit" });

// any Kinan left (outside embedded images) is a miss: list it
const left = [];
// (the destination's own files — the portal's gate — are not ours to check)
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (d === dest && KEEP.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (TEXT.test(p)) { const t = fs.readFileSync(p, "utf8").split(/[A-Za-z0-9+/=]{300,}/).join(""); if (/kinan|كنان/i.test(t)) left.push(path.relative(dest, p)); } } };
walk(dest);
console.log(`vanilla edition: ${n} files → ${dest}${left.length ? `\nstill mentions Kinan: ${left.join(", ")}` : " (no Kinan left)"}`);
