import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(
  root,
  ".playwright-browsers"
);

const port = Number(process.env.E2E_PORT || 4174);
const runToken =
  process.env.PLAYWRIGHT_RUN_TOKEN ||
  `${Date.now()}-${process.pid}`;
const artifactRoot = path.join(
  os.tmpdir(),
  "sport-event-map-playwright",
  runToken
);
const testOutputDir = path.join(artifactRoot, "test-results");
const htmlReportDir = path.join(artifactRoot, "html-report");
const server = spawn(
  process.execPath,
  [
    path.join(root, "tests", "e2e", "server.mjs")
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      E2E_PORT: String(port)
    },
    stdio: [
      "ignore",
      "pipe",
      "pipe"
    ]
  }
);

server.stdout.on("data", chunk => {
  process.stdout.write(chunk);
});

server.stderr.on("data", chunk => {
  process.stderr.write(chunk);
});

async function waitForServer() {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const ready = await new Promise(resolve => {
      const request = http.get(
        `http://127.0.0.1:${port}/index.html`,
        response => {
          response.resume();
          resolve(response.statusCode === 200);
        }
      );

      request.on("error", () => resolve(false));
      request.setTimeout(800, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (ready) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 120));
  }

  throw new Error(`E2E server did not start on port ${port}`);
}

function stopServer() {
  if (!server.killed) {
    server.kill("SIGTERM");
  }
}

const cliPath = path.join(
  root,
  "node_modules",
  "@playwright",
  "test",
  "cli.js"
);

let result;

try {
  await waitForServer();

  result = spawnSync(
    process.execPath,
    [
      cliPath,
      "test",
      ...process.argv.slice(2)
    ],
    {
      cwd: root,
      env: {
      ...process.env,
      E2E_PORT: String(port),
      E2E_SKIP_WEB_SERVER: "1",
      PLAYWRIGHT_OUTPUT_DIR: testOutputDir,
      PLAYWRIGHT_HTML_REPORT: htmlReportDir
    },
      stdio: "inherit"
    }
  );
} finally {
  stopServer();
}

console.log(`Playwright artifacts: ${artifactRoot}`);

process.exit(result.status ?? 1);
