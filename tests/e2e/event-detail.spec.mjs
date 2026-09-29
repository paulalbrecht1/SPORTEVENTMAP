import { expect, test } from "@playwright/test";
import fs from 'node:fs';
const archive = JSON.parse(fs.readFileSync(new URL('../../data/event-editions-public.json', import.meta.url), 'utf8')).editions;
const liveRow = { ...archive.find(row => row.edition_slug === '10-charity-lauf-koldingen-2026'), official_url: 'https://official.example/koldingen' };

const detailPath =
  "/event/10-charity-lauf-koldingen-2026/";

const leafletStub = `
  window.L = {
    map() {
      return {
        setView() { return this; }
      };
    },
    tileLayer() {
      return { addTo() {} };
    },
    marker() {
      return { addTo() {} };
    }
  };
`;

async function prepareDetailPage(page, options = {}) {
  const {
    favorites = [],
    cloud = null
  } = options;

  await page.route("**/js/config.js", route =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: 'window.SPORT_EVENT_MAP_CONFIG = {supabaseUrl:"https://detail-behavior.test",supabasePublishableKey:"public-test"};'
    })
  );

  await page.route("https://unpkg.com/**", route =>
    route.fulfill({
      status: 200,
      contentType:
        route.request().resourceType() === "stylesheet"
          ? "text/css"
          : "text/javascript",
      body:
        route.request().resourceType() === "script"
          ? leafletStub
          : ""
    })
  );

  await page.route('https://detail-behavior.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([liveRow]) }));
  await page.route('https://detail-behavior.test/rest/v1/rpc/get_public_event_freshness_guard', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ decisions: { [liveRow.edition_id]: false } }) }));

  await page.addInitScript(({ favorites, cloud }) => {
    localStorage.setItem('sportEventMapLanguage', 'en');
    if (
      localStorage.getItem("sportEventMap.detailE2ESeeded") !== "true"
    ) {
      localStorage.setItem(
        "seasonPlannerEvents",
        JSON.stringify(favorites)
      );
      localStorage.setItem(
        "sportEventMap.detailE2ESeeded",
        "true"
      );
    }

    if (!cloud) {
      return;
    }

    const operationLog = [];

    window.__detailCloudOperationLog =
      operationLog;
    window.__sportEventMapDetailSupabaseClient = {
      auth: {
        async getUser() {
          return {
            data: {
              user: {
                id: "detail-test-user"
              }
            }
          };
        }
      },
      from(table) {
        let operation = "select";

        const builder = {
          select() {
            operation = "select";
            return this;
          },
          delete() {
            operation = "delete";
            return this;
          },
          eq() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data:
                cloud.remoteSaved
                  ? [{ event_id: "saved" }]
                  : [],
              error: null
            });
          },
          async upsert() {
            operationLog.push({
              table,
              operation: "upsert"
            });

            return {
              data: null,
              error:
                cloud.failTable === table
                  ? { message: "forced detail sync failure" }
                  : null
            };
          },
          then(resolve) {
            operationLog.push({
              table,
              operation
            });
            resolve({
              data: [],
              error: null
            });
          }
        };

        return builder;
      }
    };
  }, {
    favorites,
    cloud
  });

  await page.goto(detailPath);
  await expect(page.locator("html")).toHaveAttribute("data-sem-public-detail-state", "verified");
}

test("Season button adds, survives reload, prevents duplicates and removes", async ({ page }) => {
  await prepareDetailPage(page);

  const button =
    page.locator("#addDetailEventToSeason");

  await expect(button).toHaveText("Add to Season");

  await page.evaluate(() => {
    const target =
      document.getElementById("addDetailEventToSeason");

    target.click();
    target.click();
    target.click();
  });

  await expect(button).toHaveText("In your season");
  await expect(button).toHaveAttribute("aria-pressed", "true");

  let favorites =
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]")
    );

  expect(favorites).toHaveLength(1);

  await page.reload();
  await expect(button).toHaveText("In your season");

  await button.click();
  await expect(button).toHaveText("Add to Season");
  await expect(page.locator("#detailActionStatus"))
    .toContainText("Removed from your season.");

  favorites =
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]")
    );

  expect(favorites).toEqual([]);
});

test("signed-in state loads from the existing Season Planner table", async ({ page }) => {
  await prepareDetailPage(page, {
    cloud: {
      remoteSaved: true
    }
  });

  const button =
    page.locator("#addDetailEventToSeason");

  await expect(button).toHaveText("In your season");
  await expect(button).toHaveAttribute("aria-pressed", "true");

  const favorites =
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]")
    );

  expect(favorites).toHaveLength(1);
});

test("failed cloud save restores the previous state and reports the error", async ({ page }) => {
  await prepareDetailPage(page, {
    cloud: {
      remoteSaved: false,
      failTable: "season_planner_events"
    }
  });

  const button =
    page.locator("#addDetailEventToSeason");

  await button.click();

  await expect(button).toHaveText("Add to Season");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#detailActionStatus"))
    .toContainText("Could not save. Please try again.");

  const favorites =
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("seasonPlannerEvents") || "[]")
    );

  expect(favorites).toEqual([]);
});

test("section navigation has an active state and scrolls to the target", async ({ page }) => {
  await prepareDetailPage(page);

  await expect(page.locator('[data-detail-section="course"]')).toHaveCount(0);
  const sourcesLink =
    page.locator('[data-detail-section="sources"]');

  await sourcesLink.click();

  await expect(sourcesLink).toHaveClass(/is-active/);
  await expect(sourcesLink).toHaveAttribute("aria-current", "location");
  await expect(page).toHaveURL(/#sources$/);
});

test("detail hero and action card remain within common viewport widths", async ({ page }) => {
  await prepareDetailPage(page);

  for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport);

    const layout =
      await page.evaluate(() => {
        const card =
          document.querySelector(".event-detail-cta-card");
        const official =
          document.querySelector("#liveDetailOfficial");
        const season =
          document.querySelector("#addDetailEventToSeason");

        return {
          bodyWidth:
            document.documentElement.scrollWidth,
          viewportWidth:
            document.documentElement.clientWidth,
          cardRight:
            card.getBoundingClientRect().right,
          officialHeight:
            official.getBoundingClientRect().height,
          seasonHeight:
            season.getBoundingClientRect().height,
          statusOverflow:
            card.scrollWidth > card.clientWidth
        };
      });

    expect(layout.bodyWidth).toBeLessThanOrEqual(
      layout.viewportWidth + 1
    );
    expect(layout.cardRight).toBeLessThanOrEqual(
      layout.viewportWidth + 1
    );
    expect(layout.statusOverflow).toBe(false);
    expect(layout.officialHeight).toBeGreaterThanOrEqual(44);
    expect(layout.seasonHeight).toBeGreaterThanOrEqual(44);
    expect(
      Math.abs(
        layout.officialHeight -
        layout.seasonHeight
      )
    ).toBeLessThanOrEqual(1);
  }

  const official =
    page.locator("#liveDetailOfficial");

  await expect(official).toHaveAttribute("target", "_blank");
  await expect(official).toHaveAccessibleName("Official website / registration");
  await expect(official).toHaveAttribute("href", liveRow.official_url);
});
