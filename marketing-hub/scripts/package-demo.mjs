// Builds the Kinan demo package: ../kinan-demo.zip with the one-file demo, the demo kit, the docs and the app source.
//   npm run demo:package   (rebuilds demo.html from a fresh sample database first)
import { execSync } from "child_process";
import { mkdirSync, rmSync, cpSync, copyFileSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import os from "os";

const root = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(root, "..");
const run = (c, cwd = root) => execSync(c, { cwd, stdio: "inherit" });

run("npm run demo:reset");
run("npm run demo:build");
copyFileSync(path.join(root, "demo.html"), path.join(repo, "marketing-hub-demo.html"));

const stage = path.join(os.tmpdir(), "kinan-demo-stage");
const top = path.join(stage, "kinan-demo");
rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(top, "docs"), { recursive: true });

copyFileSync(path.join(root, "demo.html"), path.join(top, "1-OPEN-ME-demo.html"));
copyFileSync(path.join(root, "docs/demo-kit.html"), path.join(top, "2-demo-kit-capabilities-and-checklist.html"));
copyFileSync(path.join(root, "docs/START-HERE.md"), path.join(top, "START-HERE.md"));
for (const f of ["demo-checklist.md", "capabilities.md", "kinan-integration.md", "crm-integration.md", "data-sources.md"])
  copyFileSync(path.join(root, "docs", f), path.join(top, "docs", f));

// App source: tracked files only (no node_modules, database, .env or build output).
const files = execSync("git ls-files", { cwd: root }).toString().trim().split("\n").filter((f) => f && f !== "demo.html");
for (const f of files) {
  const to = path.join(top, "app-source", f);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(path.join(root, f), to);
}
writeFileSync(path.join(top, "VERSION.txt"), `Built ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from commit ${execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim()}\nSample data frozen on 8 June 2026.\n`);

const zip = path.join(repo, "kinan-demo.zip");
rmSync(zip, { force: true });
run(`zip -qr -X "${zip}" kinan-demo`, stage);
rmSync(stage, { recursive: true, force: true });
console.log(`wrote ${zip}`);
