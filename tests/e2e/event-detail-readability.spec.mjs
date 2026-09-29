import { expect, test } from "@playwright/test";
import fs from 'node:fs';
const archive = JSON.parse(fs.readFileSync(new URL('../../data/event-editions-public.json', import.meta.url), 'utf8')).editions;

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
  await page.goto(detailPath);
  await expect(page.locator('html')).toHaveAttribute('data-sem-public-detail-state', 'verified');
}

for (const detail of detailPages) {
  test(`${detail.name} keeps facts readable in both themes`, async ({ page }) => {
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
      }
    }
  });
}

test("unconfirmed canonical registration status stays readable without a stale global badge", async ({ page }) => {
  await preparePage(page, "/event/bmw-berlin-marathon-2026/");
  const card = page.locator('[data-public-detail-field="registration"]');
  await expect(card).toHaveText('RegistrationCheck with the organizer');
  await expect(page.locator('.race-guide-status-panel > .event-detail-badge.pending')).toHaveCount(0);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      const result = await card.evaluate(node => ({
        background: getComputedStyle(node).backgroundColor,
        color: getComputedStyle(node.querySelector('strong')).color,
        label: getComputedStyle(node.querySelector('span')).color,
        overflows: node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
      }));
      expect(result.overflows).toBe(false);
      expect(contrastRatio(result.color, result.background), theme + ' status value').toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(result.label, result.background), theme + ' status label').toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("Berlin registration dates and fee context are clear", async ({ page }) => {
  await preparePage(page, "/event/bmw-berlin-marathon-2026/");

  const periodCard = page.locator(
    "#registration .race-guide-fact-card.is-registration-period"
  );
  await expect(periodCard.locator("strong"))
    .toHaveText("25.09.2025");
  await expect(page.locator(
    "#registration .race-guide-fact-card.is-registration-deadline strong"
  )).toHaveText("06.11.2025");

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
  expect(typography.wordBreak).toBe("keep-all");
  expect(
    contrastRatio(typography.color, typography.background)
  ).toBeGreaterThanOrEqual(4.5);

  // Dates remain distinct editorial knowledge; the editable canonical fee wins.
  const price = page.locator('[data-public-detail-field="price"]');
  await expect(price.locator('strong')).toHaveText('210 – 230 EUR');
  await expect(page.locator('#registration .race-guide-table')).toHaveCount(0);
  await expect(page.locator('#registration')).not.toContainText('EUR 205');
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

test("detail accordions and green chips stay readable in both themes", async ({ page }) => {
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
        const chip = document.querySelector("#course .race-guide-chip");
        const chipGroup = chip.closest(".race-guide-chip-group");
        const label = chipGroup.querySelector(":scope > span");
        const section = chip.closest(".event-detail-card");
        const readStyle = element => {
          const style = getComputedStyle(element);

          return {
            background: style.backgroundColor,
            color: style.color
          };
        };

        return {
          content: readStyle(content),
          chip: readStyle(chip),
          label: {
            color: getComputedStyle(label).color,
            background: getComputedStyle(section).backgroundColor
          },
          toggle: {
            background: toggleStyle.backgroundColor,
            color: toggleStyle.color
          },
          accordionOverflows:
            content.scrollWidth > content.clientWidth + 1 ||
            content.scrollHeight > content.clientHeight + 1,
          chipOverflows:
            chip.scrollWidth > chip.clientWidth + 1 ||
            chip.scrollHeight > chip.clientHeight + 1
        };
      });

      for (const component of [
        styles.content,
        styles.chip,
        styles.label,
        styles.toggle
      ]) {
        expect(
          contrastRatio(component.color, component.background),
          theme + " detail component lacks contrast at " + viewport.width + "px"
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(styles.accordionOverflows).toBe(false);
      expect(styles.chipOverflows).toBe(false);

      if (theme === "light") {
        expect(styles.content).toEqual({
          background: "rgb(255, 255, 255)",
          color: "rgb(64, 86, 74)"
        });
        expect(styles.chip).toEqual({
          background: "rgb(231, 248, 237)",
          color: "rgb(20, 83, 45)"
        });
        expect(styles.toggle).toEqual({
          background: "rgb(233, 248, 238)",
          color: "rgb(22, 101, 52)"
        });
      } else {
        expect(styles.content).toEqual({
          background: "rgb(18, 37, 31)",
          color: "rgb(212, 222, 216)"
        });
        expect(styles.chip).toEqual({
          background: "rgb(23, 61, 42)",
          color: "rgb(220, 252, 231)"
        });
        expect(styles.toggle).toEqual({
          background: "rgb(25, 55, 42)",
          color: "rgb(187, 247, 208)"
        });
      }
    }
  }
});
