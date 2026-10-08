// Writes the Kinan Bay demo document pack (lib/model3d/mock.ts — the same files as "Load the demo pack" in the app)
// to samples/kinan-bay-demo/ and samples/kinan-bay-demo.zip, ready to upload on + New project.
// Usage: npm run demo-pack
import { build } from "esbuild";
import fs from "node:fs";
import { zipSync, strToU8 } from "fflate";

const root = new URL("..", import.meta.url).pathname;
const res = await build({ entryPoints: [root + "lib/model3d/mock.ts"], bundle: true, write: false, format: "esm", platform: "node", logLevel: "error" });
const { mockDocs } = await import("data:text/javascript;base64," + Buffer.from(res.outputFiles[0].text).toString("base64"));
const dir = root + "samples/kinan-bay-demo/";
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const files = {};
for (const d of mockDocs()) { fs.writeFileSync(dir + d.name, d.text); files[`Kinan Bay Residences/${d.name}`] = [strToU8(d.text), { mtime: new Date("2026-10-01T08:00:00Z") }]; }
fs.writeFileSync(root + "samples/kinan-bay-demo.zip", zipSync(files, { level: 9 }));
console.log(`wrote ${mockDocs().length} documents to samples/kinan-bay-demo/ and samples/kinan-bay-demo.zip`);
