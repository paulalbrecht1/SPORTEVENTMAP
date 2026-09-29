import { expect, test } from "@playwright/test";
import fs from 'node:fs';
const archive = JSON.parse(fs.readFileSync(new URL('../../data/event-editions-public.json', import.meta.url), 'utf8')).editions;
const richRecords = JSON.parse(fs.readFileSync(new URL('../../data/event-detail-database.json', import.meta.url), 'utf8'));

const detailPages = [
  {
    name: "ordinary event",
    path: "/event/10-charity-lauf-koldingen-2026/"
  },
  {
    name: "Berlin Marathon knowledge page",
    path: "/event/bmw-berlin-marathon-2026/"
  },
  {
    name: "Paderborner Osterlauf standard page",
    path: "/event/paderborner-osterlauf-2026/"
  },
  {
    name: "London Marathon knowledge page",
    path: "/event/london-marathon-2027/"
  },
  {
    name: "long German event title",
    path: "/event/1-laufchallenge-mellendorfer-tv-2026/"
  }
];

const viewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 }
];

function contrastRatio(foreground, background) {
  const parse = value => {
    const channels =
      value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];

    return channels.map(channel => {
      const normalized = channel / 255;

      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };

  const luminance = value => {
    const [red, green, blue] = parse(value);

    return (
      (0.2126 * red) +
      (0.7152 * green) +
      (0.0722 * blue)
    );
  };

  const light = Math.max(
    luminance(foreground),
    luminance(background)
  );
  const dark = Math.min(
    luminance(foreground),
    luminance(background)
  );

  return (light + 0.05) / (dark + 0.05);
}

async function preparePage(page, detailPath) {
  await page.route("**/js/config.js", route =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: 'window.SPORT_EVENT_MAP_CONFIG = {supabaseUrl:"https://detail-readability.test",supabasePublishableKey:"public-test"};'
    })
  );

  await page.route("https://unpkg.com/**", route =>
    route.fulfill({
      status: 200,
      contentType:
        route.request().resourceType() === "stylesheet"
          ? "text/css"
          : "text/javascript",
      body: ""
    })
  );

  const slug = detailPath.split('/').filter(Boolean).at(-1);
  const row = { ...archive.find(item => item.edition_slug === slug), registration_status: 'unknown', price_min: 210, price_max: 230, currency: 'EUR' };
  await page.addInitScript(() => localStorage.setItem('sportEventMapLanguage', 'en'));
  await page.route('https://detail-readability.test/rest/v1/public_event_archive?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([row]) }));
  await page.route('https://detail-readability.test/rest/v1/rpc/get_public_event_freshness_guard', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ decisions: { [row.edition_id]: false } }) }));
  await page.route('https://detail-readability.test/rest/v1/rpc/get_public_event_detail_bundle', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(richRecords.filter(item =>
    item.edition_id === row.edition_id || (item.knowledge_scope === 'brand' && String(item.event_brand_id) === String(row.event_id)))) }));
  await page.goto(detailPath);
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'verified');
}

for (const detail of detailPages) {
  test(`${detail.name} keeps facts readable in both themes`, async ({ page }, testInfo) => {
    await preparePage(page, detail.path);

    await expect(
      page.locator(".event-detail-hero-chips")
    ).toHaveCount(0);
    await expect(
      page.locator(".race-guide-fact-card").first()
    ).toBeVisible();

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);

      for (const theme of ["light", "dark"]) {
        await page.evaluate(activeTheme => {
          document.documentElement.setAttribute(
            "data-theme",
            activeTheme
          );
        }, theme);

        const result = await page.evaluate(() => {
          const cards = [
            ...document.querySelectorAll(
              ".race-guide-fact-card, .race-guide-registration-status"
            )
          ];
          const contrastPairs = cards.flatMap(card => {
            const background =
              getComputedStyle(card).backgroundColor;

            return [
              ...card.querySelectorAll("strong, small")
            ]
              .filter(node => node.textContent.trim())
              .map(node => ({
                foreground:
                  getComputedStyle(node).color,
                background,
                text: node.textContent.trim()
              }));
          });

          return {
            viewportWidth:
              document.documentElement.clientWidth,
            documentWidth:
              document.documentElement.scrollWidth,
            hiddenTabScrollbar:
              getComputedStyle(
                document.querySelector(".event-detail-tabs")
              ).scrollbarWidth === "none",
            overflowingCards: cards
              .filter(card =>
                card.scrollWidth > card.clientWidth + 1 ||
                card.scrollHeight > card.clientHeight + 1
              )
              .map(card =>
                card.textContent.replace(/\s+/g, " ").trim()
              ),
            contrastPairs
          };
        });

        expect(
          result.documentWidth,
          `${detail.name} / ${theme} / ${viewport.width}px`
        ).toBeLessThanOrEqual(result.viewportWidth + 1);
        expect(result.hiddenTabScrollbar).toBe(true);
        expect(result.overflowingCards).toEqual([]);

        for (const pair of result.contrastPairs) {
          expect(
            contrastRatio(
              pair.foreground,
              pair.background
            ),
            `${detail.name}: "${pair.text}" lacks contrast in ${theme} mode`
          ).toBeGreaterThanOrEqual(4.5);
        }
        if (/Berlin|Paderborner/.test(detail.name) && theme === 'light' && [390, 1280].includes(viewport.width)) {
          const file = testInfo.outputPath(`${detail.path.split('/').filter(Boolean).at(-1)}-${viewport.width}.png`);
          await page.screenshot({ path: file, fullPage: true });
          await testInfo.attach(`public-detail-${viewport.width}`, { path: file, contentType: 'image/png' });
        }
      }
    }
  });
}

test("unconfirmed canonical registration status is omitted without a stale global badge", async ({ page }) => {
  await preparePage(page, "/event/bmw-berlin-marathon-2026/");
  await expect(page.locator('[data-public-detail-field="registration"]')).toHaveCount(0);
  await expect(page.locator('#liveDetailFacts')).not.toContainText('Registration open');
  await expect(page.locator('.race-guide-status-panel > .event-detail-badge.pending')).toHaveCount(0);
  await page.locator('#eventDetailLanguageSelect').selectOption('de');
  await expect(page.locator('[data-public-detail-field="registration"]')).toHaveCount(0);
  await expect(page.locator('#liveDetailFacts')).not.toContainText('Anmeldung offen');
});

test("Berlin registration dates and fee context are clear", async ({ page }) => {
  await preparePage(page, "/event/bmw-berlin-marathon-2026/");

  const periodCard = page.locator('#registration .race-guide-fact-card').filter({ has: page.getByText('Registration opens', { exact: true }) });
  await expect(periodCard.locator("strong"))
    .toHaveText('25 Sept 2025');
  await expect(page.locator('#registration .race-guide-fact-card').filter({ has: page.getByText('Registration deadline', { exact: true }) }).locator('strong')).toHaveText('6 Nov 2025');

  const typography = await periodCard.locator("strong")
    .evaluate(value => {
      const style = getComputedStyle(value);

      return {
        color: style.color,
        background: getComputedStyle(value.closest("article")).backgroundColor,
        fontSize: parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight),
        wordBreak: style.wordBreak
      };
    });
  expect(typography.fontSize).toBeGreaterThanOrEqual(16);
  expect(typography.fontWeight).toBeGreaterThanOrEqual(700);
  expect(
    contrastRatio(typography.color, typography.background)
  ).toBeGreaterThanOrEqual(4.5);

  // A scalar old annual fee must not become a fictitious price tier or override
  // the canonical price. Genuine structured tiers are covered by parity tests.
  const price = page.locator('[data-public-detail-field="price"]');
  await expect(price.locator('strong')).toHaveText('210 – 230 EUR');
  await expect(page.locator('#registration .race-guide-table')).toHaveCount(0);
  await expect(page.locator('#registration')).not.toContainText('205 EUR');
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const styles = await price.evaluate(card => ({
        background: getComputedStyle(card).backgroundColor,
        color: getComputedStyle(card.querySelector('strong')).color,
        overflows: card.scrollWidth > card.clientWidth + 1
      }));
      expect(styles.overflows).toBe(false);
      expect(contrastRatio(styles.color, styles.background)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("detail accordions and rich fact cards stay readable in both themes", async ({ page }) => {
  await preparePage(page, "/event/bmw-berlin-marathon-2026/");

  const accordion = page.locator(
    "#registration .race-guide-accordion"
  ).first();
  await accordion.evaluate(details => {
    details.open = true;
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport);

    for (const theme of ["light", "dark"]) {
      await page.evaluate(activeTheme => {
        document.documentElement.setAttribute("data-theme", activeTheme);
      }, theme);

      const styles = await page.evaluate(() => {
        const content = document.querySelector(
          "#registration .race-guide-accordion[open] > div"
        );
        const summary = content.parentElement.querySelector("summary");
        const toggleStyle = getComputedStyle(summary, "::after");
        const card = document.querySelector("#course .race-guide-fact-card");
        const value = card.querySelector("strong");
        const label = card.querySelector("span:not(.event-detail-icon)");
        const readStyle = element => {
          const style = getComputedStyle(element);

          return {
            background: style.backgroundColor,
            color: style.color
          };
        };

        return {
          content: readStyle(content),
          fact: { color: getComputedStyle(value).color, background: getComputedStyle(card).backgroundColor },
          factFontSize: parseFloat(getComputedStyle(value).fontSize),
          label: {
            color: getComputedStyle(label).color,
            background: getComputedStyle(card).backgroundColor
          },
          toggle: {
            background: toggleStyle.backgroundColor,
            color: toggleStyle.color
          },
          accordionOverflows:
            content.scrollWidth > content.clientWidth + 1 ||
            content.scrollHeight > content.clientHeight + 1,
          factOverflows:
            value.scrollWidth > value.clientWidth + 1 ||
            value.scrollHeight > value.clientHeight + 1
        };
      });

      for (const component of [
        styles.content,
        styles.fact,
        styles.label,
        styles.toggle
      ]) {
        expect(
          contrastRatio(component.color, component.background),
          theme + " detail component lacks contrast at " + viewport.width + "px"
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(styles.accordionOverflows).toBe(false);
      expect(styles.factOverflows).toBe(false);
      expect(styles.factFontSize).toBeGreaterThanOrEqual(16);
    }
  }
});
