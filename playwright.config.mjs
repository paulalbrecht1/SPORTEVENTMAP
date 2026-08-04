import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.E2E_PORT || 4174);
const baseURL = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(
  os.tmpdir(),
  "sport-event-map-playwright"
);
const outputDir =
  process.env.PLAYWRIGHT_OUTPUT_DIR ||
  path.join(artifactRoot, "test-results");
const htmlReportDir =
  process.env.PLAYWRIGHT_HTML_REPORT ||
  path.join(artifactRoot, "html-report");

process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(
  root,
  ".playwright-browsers"
);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir,
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", {
      outputFolder: htmlReportDir,
      open: "never"
    }]
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: {
          width: 1440,
          height: 900
        }
      },
      testIgnore: /planner-mobile\.spec\.mjs/
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"]
      },
      testMatch: /planner-mobile\.spec\.mjs/
    }
  ],
  webServer: process.env.E2E_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "node tests/e2e/server.mjs",
        url: `${baseURL}/index.html`,
        timeout: 20_000,
        reuseExistingServer: false,
        env: {
          E2E_PORT: String(port)
        }
      }
});
