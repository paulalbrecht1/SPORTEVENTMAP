import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.E2E_PORT || 4174);
const baseURL = `http://127.0.0.1:${port}`;

process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(
  root,
  ".playwright-browsers"
);

export default defineConfig({
  testDir: "./tests/e2e",
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
      outputFolder: "playwright-report",
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
