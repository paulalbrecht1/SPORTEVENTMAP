import { expect, prepareApp, test } from "./helpers/browser.mjs";

async function readLanguagePillMetrics(locator) {
  return locator.evaluate(element => {
    const style = getComputedStyle(element);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);

    return {
      value: element.value,
      width: element.getBoundingClientRect().width,
      contentWidth: element.clientWidth - padding,
      overflow: style.overflow,
      textAlign: style.textAlign,
      textAlignLast: style.textAlignLast
    };
  });
}

test("Home changes every primary text group between English and German", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await prepareApp(page, { route: "home", openDiscoveryPanel: false });

  const languageSelect = page.locator("#landingLanguageSelect");
  await expect(languageSelect).toBeVisible();

  const englishMetrics = await readLanguagePillMetrics(languageSelect);
  expect(englishMetrics.value).toBe("en");
  expect(englishMetrics.width).toBeGreaterThanOrEqual(75);
  expect(englishMetrics.contentWidth).toBeGreaterThanOrEqual(28);
  expect(englishMetrics.textAlign).toBe("left");
  expect(englishMetrics.textAlignLast).toBe("left");

  await languageSelect.selectOption("de");
  await expect(languageSelect).toHaveValue("de");
  await page.waitForTimeout(450);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#sem-home-title"))
    .toContainText("Finde dein nächstes Rennen.");
  await expect(page.locator("#sem-home-title"))
    .toContainText("Plane deine gesamte Saison.");
  await expect(page.locator("#landingDiscoverBtn"))
    .toHaveText("Events entdecken");
  await expect(page.locator("#landingSeasonBtn"))
    .toHaveText("Saisonplaner öffnen");
  await expect(page.locator("#landingAuthBtn"))
    .toHaveText("Anmelden");
  await expect(page.locator("#sem-workflow-title"))
    .toHaveText("Von der Eventsuche bis zum Renntag");
  await expect(page.locator("#sem-features-title"))
    .toHaveText("Alles, was du für deine Rennsaison brauchst");
  await expect(page.locator("#sem-sports-title"))
    .toHaveText("Für Ausdauersportler entwickelt");
  await expect(page.locator("#sem-cta-title"))
    .toHaveText("Deine nächste Saison beginnt mit dem richtigen Event.");
  await expect(page.locator(".sem-desktop-nav"))
    .toContainText("Saisonplaner");
  await expect(page.locator(".sem-footer"))
    .toContainText("Datenschutz");
  expect(await page.evaluate(() => localStorage.getItem("sportEventMapLanguage")))
    .toBe("de");
  expect((await readLanguagePillMetrics(languageSelect)).contentWidth)
    .toBeGreaterThanOrEqual(28);

  await languageSelect.selectOption("en");
  await page.waitForTimeout(450);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#sem-home-title"))
    .toContainText("Find your next race.");
  await expect(page.locator("#landingDiscoverBtn"))
    .toHaveText("Explore Events");
  await expect(page.locator("#landingSeasonBtn"))
    .toHaveText("Open Season Planner");
  await expect(page.locator("#landingAuthBtn"))
    .toHaveText("Login");
  await expect(page.locator("#sem-workflow-title"))
    .toHaveText("From race discovery to race day");
  await expect(page.locator("#sem-cta-title"))
    .toHaveText("Your next season starts with the right event.");
});

test("mobile Discovery keeps the compact language pill legible", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await prepareApp(page, { openDiscoveryPanel: false });

  const languageSelect = page.locator("#topbarLanguageSelect");
  await expect(languageSelect).toBeVisible();

  const metrics = await readLanguagePillMetrics(languageSelect);
  expect(metrics.width).toBeGreaterThanOrEqual(61);
  expect(metrics.contentWidth).toBeGreaterThanOrEqual(27);
  expect(metrics.value).toBe("en");
});


test("language choice stays synchronized between Home and Discovery", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await prepareApp(page, { route: "home", openDiscoveryPanel: false });

  await page.locator("#landingLanguageSelect").selectOption("de");
  await page.locator(".sem-desktop-nav [data-landing-route='discovery']").click();

  await expect(page.locator("body")).toHaveClass(/platform-route-discovery/);
  await expect(page.locator("#topbarLanguageSelect")).toHaveValue("de");
  await expect(page.locator("#searchInput"))
    .toHaveAttribute("placeholder", "Finde dein nächstes Rennen...");
  await expect(page.locator("#platformNav"))
    .toContainText("Entdecken");

  await page.locator("#topbarLanguageSelect").selectOption("en");
  await expect(page.locator("#landingLanguageSelect")).toHaveValue("en");
  await expect(page.locator("#searchInput"))
    .toHaveAttribute("placeholder", "Find your next race...");

  await page.locator("#platformNav [data-platform-route='home']").click();
  await expect(page.locator("#sem-home-title"))
    .toContainText("Find your next race.");
});
