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

const NAME = "Meridian", NAME_AR = "ميريديان";
const COLOURS = [ // Kinan orange → teal, light and dark themes, every notation used in the code
  ["#f15a22", "#0b7a75"], ["#d94a16", "#09625e"], ["#fff1ea", "#e3f4f3"], ["#fde3d8", "#d4eeec"], ["#f5b89a", "#9fd5d0"],
  ["#ff6a33", "#3cc7bd"], ["#ff7a45", "#5fd6cd"], ["#1b0d04", "#03201e"], ["#3d2217", "#123532"], ["#7a4126", "#1f5f5a"],
  ["#d94a15", "#09625e"], ["#ff6a37", "#3cc7bd"], ["255,106,51", "60,199,189"],
  ["0xf15a22", "0x0b7a75"], ["241,90,34", "11,122,117"], ["241, 90, 34", "11, 122, 117"],
];
const RENAME = [ // order matters: specific before general
  ["kinan-site-agent", "site-agent"], ["www.kinan.com.sa", "www.example.com"], ["kinan.com.sa", "example.com"],
  ["KINAN_", "APP_"], ["KH-", "MH-"], ["KB-", "MB-"], ["LIVE THE PLACE", "BUILD WITH CERTAINTY"],
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
const SKIP = (f) => f === "kinan-site-agent.html" || f === "middleware.ts" || f.startsWith("editions/") || f.startsWith("brand/whatsapp/") || /texture\.jpg$/.test(f) || f === "kinan-site-agent-vercel.zip";

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

// the brand: the vanilla wordmark and mark, no texture; the home-screen icon; the deck's embedded artwork
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
fs.writeFileSync(path.join(dest, "public", "icon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#2e2e2f"/><svg x="18" y="14" width="28" height="35" viewBox="${M.viewBox}"><path fill="#3cc7bd" d="${M.d}"/></svg></svg>\n`);
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
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (["node_modules", ".next", "data"].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (TEXT.test(p)) { const t = fs.readFileSync(p, "utf8").split(/[A-Za-z0-9+/=]{300,}/).join(""); if (/kinan|كنان/i.test(t)) left.push(path.relative(dest, p)); } } };
walk(dest);
console.log(`vanilla edition: ${n} files → ${dest}${left.length ? `\nstill mentions Kinan: ${left.join(", ")}` : " (no Kinan left)"}`);
