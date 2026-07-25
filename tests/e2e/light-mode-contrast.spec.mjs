import {
  expect,
  openPlanner,
  prepareApp,
  selectPlannerTab,
  test
} from "./helpers/browser.mjs";
import { fixtureByName } from "./helpers/fixtures.mjs";

async function expectReadable(page, selector, minimumContrast = 4.5) {
  const samples = await page.locator(selector).evaluateAll(elements => {
    const parseColor = value => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const values = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return {
        red: values[0],
        green: values[1],
        blue: values[2],
        alpha: values[3] ?? 1
      };
    };
    const composite = (foreground, background) => ({
      red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
      green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
      blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
      alpha: 1
    });
    const luminance = color => {
      const channel = value => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.red) +
        0.7152 * channel(color.green) +
        0.0722 * channel(color.blue);
    };
    const ratio = (foreground, background) => {
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return (light + 0.05) / (dark + 0.05);
    };

    return elements
      .filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0;
      })
      .map(element => {
        const ancestors = [];
        for (let current = element; current; current = current.parentElement) {
          ancestors.push(current);
        }
        let background = { red: 255, green: 255, blue: 255, alpha: 1 };
        for (const ancestor of ancestors.reverse()) {
          const color = parseColor(getComputedStyle(ancestor).backgroundColor);
          if (color && color.alpha > 0) background = composite(color, background);
        }
        const foreground = parseColor(getComputedStyle(element).color);
        return {
          text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 80),
          foreground: getComputedStyle(element).color,
          background: "rgb(" + Math.round(background.red) + ", " +
            Math.round(background.green) + ", " + Math.round(background.blue) + ")",
          contrast: foreground ? ratio(composite(foreground, background), background) : 21
        };
      });
  });

  expect(samples, selector + " should render visible text").not.toHaveLength(0);
  for (const sample of samples) {
    expect(
      sample.contrast,
      selector + " (\"" + sample.text + "\") uses " +
        sample.foreground + " on " + sample.background
    ).toBeGreaterThanOrEqual(minimumContrast);
  }
}

test("Light mode keeps Home and Season Planner text readable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const run = fixtureByName["SEM E2E Future Run"];
  const triathlon = fixtureByName["SEM E2E Olympic Triathlon"];

  await prepareApp(page, {
    allowPlanner: true,
    favorites: [run.event_key, triathlon.event_key],
    openDiscoveryPanel: false
  });
  await page.evaluate(() => window.SportEventMapTheme.apply("light", { persist: true }));
  await page.goto("/index.html#/home");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectReadable(page, ".sem-eyebrow");
  await expectReadable(page, ".sem-feature-card em");
  await expectReadable(page, ".sem-text-link");
  await expectReadable(page, ".sem-sport-tabs button[aria-selected=\"true\"]");
  await expectReadable(page, ".sem-trust-row p");
  await expectReadable(page, ".sem-planner-summary > b small");

  await page.goto("/index.html#/discovery");
  await openPlanner(page);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#landingPage")).toBeHidden();
  await expectReadable(page, "#seasonScoreMetric > strong");
  await expectReadable(page, ".season-score-badge");
  await expectReadable(page, "#seasonOverviewWarnings > p");
  await expectReadable(page, ".season-training-hero > em");
  await expectReadable(page, ".season-training-route span");
  await expectReadable(page, ".season-race-mix-header strong");

  await selectPlannerTab(page, "events");
  await expectReadable(page, ".season-workspace-heading h3");
  await expectReadable(page, ".season-event-edit-button");
  await expectReadable(page, ".season-next-action-card strong");
  await expectReadable(page, ".season-task-progress strong");
  await expectReadable(page, ".season-detail-check span");
  await expectReadable(page, ".season-empty-detail span");
  await expectReadable(page, ".season-equipment-item button");
});


test("Light mode remains readable on mobile Home and Planner views", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const run = fixtureByName["SEM E2E Future Run"];
  const triathlon = fixtureByName["SEM E2E Olympic Triathlon"];

  await prepareApp(page, {
    allowPlanner: true,
    favorites: [run.event_key, triathlon.event_key],
    openDiscoveryPanel: false
  });
  await page.evaluate(() => window.SportEventMapTheme.apply("light", { persist: true }));
  await page.goto("/index.html#/home");

  await expectReadable(page, ".sem-eyebrow");
  await expectReadable(page, ".sem-trust-row p");

  await page.goto("/index.html#/discovery");
  await openPlanner(page);
  await expectReadable(page, "#seasonScoreMetric > strong");
  await expectReadable(page, ".season-score-badge");

  await selectPlannerTab(page, "events");
  await page.locator(".season-event-selector").first().click();
  await expectReadable(page, ".season-event-edit-button");
  await expectReadable(page, ".season-detail-check span");
});
