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
