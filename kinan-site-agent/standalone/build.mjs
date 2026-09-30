// Builds kinan-site-agent.html — a single self-contained file (no server, no network needed).
// Usage: node standalone/build.mjs   (needs: npx esbuild available)
import { execSync } from "node:child_process";
import fs from "node:fs";
const root = new URL("..", import.meta.url).pathname;
execSync(`npx --yes esbuild standalone/entry.ts --bundle --platform=node --format=cjs --outfile=standalone/.entry.cjs --log-level=error`, { cwd: root, stdio: "inherit" });
const data = execSync("node standalone/.entry.cjs", { cwd: root, maxBuffer: 1 << 28 }).toString().trim().replace(/</g, "\\u003c");
fs.rmSync(root + "standalone/.entry.cjs");
const css = fs.readFileSync(root + "app/globals.css", "utf8");
const html = fs.readFileSync(root + "standalone/template.html", "utf8").replace("/*CSS*/", () => css).replace("/*DATA*/", () => data);
fs.writeFileSync(root + "kinan-site-agent.html", html);
console.log("wrote kinan-site-agent.html", (html.length / 1024).toFixed(0) + " KB");
