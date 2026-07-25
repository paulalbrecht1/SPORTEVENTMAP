import { expect, test } from "@playwright/test";

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
      body: "window.SPORT_EVENT_MAP_CONFIG = {};"
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

  await page.goto(detailPath);
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

test("registration warning uses a calm readable status card", async ({ page }) => {
  await preparePage(page, "/event/bmw-berlin-marathon-2026/");

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport);

    for (const theme of ["light", "dark"]) {
      await page.evaluate(activeTheme => {
        document.documentElement.setAttribute("data-theme", activeTheme);
      }, theme);

      const result = await page.locator(
        ".race-guide-status-panel > .event-detail-badge.pending"
      ).evaluate(card => {
        const style = getComputedStyle(card);
        const iconStyle = getComputedStyle(card, "::before");

        return {
          display: style.display,
          background: style.backgroundColor,
          color: style.color,
          borderLeft: style.borderLeftColor,
          icon: iconStyle.content,
          iconBackground: iconStyle.backgroundColor,
          iconColor: iconStyle.color,
          overflows:
            card.scrollWidth > card.clientWidth + 1 ||
            card.scrollHeight > card.clientHeight + 1
        };
      });

      expect(result.display).toBe("grid");
      expect(result.icon).toBe('"!"');
      expect(result.overflows).toBe(false);
      expect(
        contrastRatio(result.color, result.background),
        theme + " warning text lacks contrast at " + viewport.width + "px"
      ).toBeGreaterThanOrEqual(4.5);

      if (theme === "light") {
        expect(result.background).toBe("rgb(242, 247, 244)");
        expect(result.color).toBe("rgb(18, 32, 25)");
        expect(result.borderLeft).toBe("rgb(183, 121, 31)");
        expect(result.iconBackground).toBe("rgb(255, 243, 214)");
        expect(result.iconColor).toBe("rgb(121, 80, 18)");
      } else {
        expect(result.background).toBe("rgb(23, 44, 37)");
        expect(result.color).toBe("rgb(248, 250, 252)");
        expect(result.borderLeft).toBe("rgb(245, 158, 11)");
      }
    }
  }
});

test("Berlin registration dates and fee context are clear", async ({ page }) => {
  await preparePage(page, "/event/bmw-berlin-marathon-2026/");

  const periodCard = page.locator(
    "#registration .race-guide-fact-card.is-registration-period"
  );
  await expect(periodCard.locator("strong"))
    .toHaveText("25.09.2025 – 06.11.2025");
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

  const feeRows = page.locator(
    "#registration .race-guide-table tbody tr"
  );
  await expect(feeRows).toHaveCount(1);
  await expect(feeRows.locator("td")).toHaveText([
    "Marathon",
    "EUR 205",
    "06.11.2025"
  ]);
  await expect(page.locator("#registration .race-guide-table"))
    .not.toContainText("Tier 1");
  await expect(page.locator("#registration .race-guide-table"))
    .not.toContainText("Tier 2");
  await expect(page.locator("#registration .race-guide-table"))
    .not.toContainText("Clothing bag");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
  });
  const mobileFeeTable = await page.locator(
    "#registration .race-guide-table-wrap.is-compact"
  ).evaluate(table => {
    const cell = table.querySelector("td");
    const labelStyle = getComputedStyle(cell, "::before");

    return {
      scrollWidth: table.scrollWidth,
      clientWidth: table.clientWidth,
      labelColor: labelStyle.color,
      background: getComputedStyle(table).backgroundColor
    };
  });
  expect(mobileFeeTable.scrollWidth)
    .toBeLessThanOrEqual(mobileFeeTable.clientWidth + 1);
  expect(
    contrastRatio(
      mobileFeeTable.labelColor,
      mobileFeeTable.background
    )
  ).toBeGreaterThanOrEqual(4.5);
});
