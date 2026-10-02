// One-step setup for the live app: creates .env from .env.example (if missing) and a fresh sample database.
//   npm install && npm run setup && npm run dev   ->  http://localhost:3001
// (npm run demo:live runs this, then a production build and server — use it for a client demo.)
import { existsSync, copyFileSync, rmSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = fileURLToPath(new URL("..", import.meta.url));
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 18 || (major === 18 && minor < 17)) {
  console.error(`Node.js 18.17 or newer is needed (you have ${process.versions.node}). Install the LTS version from https://nodejs.org.`);
  process.exit(1);
}
const env = path.join(root, ".env");
if (!existsSync(env)) {
  copyFileSync(path.join(root, ".env.example"), env);
  console.log("Created .env from .env.example (all integrations in mock mode, no AI key).");
} else console.log(".env already exists — kept as is.");
rmSync(path.join(root, "prisma/dev.db"), { force: true });
rmSync(path.join(root, "prisma/dev.db-journal"), { force: true });
execSync("npx prisma db push --skip-generate", { cwd: root, stdio: "inherit" });
console.log("\nSample database ready (data is created on the first page load).");
