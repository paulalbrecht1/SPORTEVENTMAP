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

test("EN and DE remain fully readable in the Home language pill", async ({ page }) => {
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
  expect((await readLanguagePillMetrics(languageSelect)).contentWidth)
    .toBeGreaterThanOrEqual(28);
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
