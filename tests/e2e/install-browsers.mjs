import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(
  root,
  ".playwright-browsers"
);

const cliPath = path.join(
  root,
  "node_modules",
  "@playwright",
  "test",
  "cli.js"
);

const result = spawnSync(
  process.execPath,
  [
    cliPath,
    "install",
    "chromium"
  ],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  }
);

process.exit(result.status ?? 1);
