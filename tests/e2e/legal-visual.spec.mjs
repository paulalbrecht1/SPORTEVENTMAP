import crypto from "node:crypto";
import { expect, test } from "@playwright/test";

const legalPages = [
  {
    path: "/imprint.html",
    currentHref: "imprint.html",
    fingerprints: {
      en: "000d6da9bec405382818ea119b43b225c29b64a3442d0140e6d51a7c900f37fe",
      de: "57a3da3cece1ce9cd3a7ca42fcdf4d7986e735bb3012c6da6b484f5d232e87be"
    }
  },
  {
    path: "/privacy.html",
    currentHref: "privacy.html",
    fingerprints: {
      en: "417521bf224065e4c9c3ea84421e53e20bf86cd9d46a584a8c5b354834c4d6f1",
      de: "1aa7e2d94ea94976193a7a36b80b0010315db43e46a00f84e27477c3c0c78e33"
    }
  }
];

const navigationTargets = [
  "index.html#/home",
  "index.html#/discovery",
  "index.html#/events",
  "index.html#/planner"
];

function contentFingerprint(blocks) {
  const normalized = blocks.map(block =>
    block.replace(/\s+/g, " ").trim()
  );

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

test("legal document copy remains unchanged in English and German", async ({ page }) => {
  for (const legalPage of legalPages) {
    await page.goto(legalPage.path);

    for (const language of ["en", "de"]) {
      await page.evaluate(value => {
        localStorage.setItem("sportEventMapLanguage", value);
      }, language);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", language);

      const blocks = await page
        .locator(".legal-document :is(h1, h2, p, li)")
        .allTextContents();

      expect(contentFingerprint(blocks)).toBe(
        legalPage.fingerprints[language]
      );
    }
  }
});

test("legal navigation and theme controls match the product shell", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sportEventMapLanguage", "de");
    localStorage.setItem("sportEventMapTheme", "light");
  });

  for (const legalPage of legalPages) {
    await page.goto(legalPage.path);
    await expect(page.locator("body")).toHaveClass(/legal-page--polished/);
    await expect(page.locator(".legal-brand-link")).toHaveAttribute(
      "href",
      "index.html#/home"
    );

    const navLinks = page.locator(".legal-site-nav a");
    await expect(navLinks).toHaveCount(navigationTargets.length);
    await expect(navLinks).toHaveText([
      "Start",
      "Entdecken",
      "Event-Wiki",
      "Saisonplaner"
    ]);

    for (let index = 0; index < navigationTargets.length; index += 1) {
      await expect(navLinks.nth(index)).toHaveAttribute(
        "href",
        navigationTargets[index]
      );
    }

    await expect(
      page.locator(`.legal-page-footer a[href="${legalPage.currentHref}"]`)
    ).toHaveAttribute("aria-current", "page");

    const toggle = page.locator(
      '.legal-page-content [data-theme-toggle-context="legal"]'
    );
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() =>
      page.evaluate(() => localStorage.getItem("sportEventMapTheme"))
    ).toBe("dark");

    await page.evaluate(() => {
      window.SportEventMapTheme.apply("light", { persist: true });
    });
  }
});

test("legal pages remain readable and contained across themes and breakpoints", async ({ page }) => {
  const viewports = [320, 390, 768, 1440];

  for (const legalPage of legalPages) {
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });

      for (const theme of ["light", "dark"]) {
        await page.emulateMedia({
          colorScheme: theme === "light" ? "dark" : "light"
        });
        await page.goto(legalPage.path);
        await page.evaluate(value => {
          window.SportEventMapTheme.apply(value, { persist: false });
        }, theme);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        const metrics = await page.evaluate(() => {
          const rect = selector => {
            const bounds = document
              .querySelector(selector)
              .getBoundingClientRect();

            return {
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
              width: bounds.width,
              height: bounds.height
            };
          };

          const rgb = value => {
            const values = value.match(/[\d.]+/g).map(Number);
            return values.slice(0, 3);
          };

          const luminance = value => {
            const channels = rgb(value).map(channel => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });

            return (
              0.2126 * channels[0] +
              0.7152 * channels[1] +
              0.0722 * channels[2]
            );
          };

          const contrast = (foreground, background) => {
            const first = luminance(foreground);
            const second = luminance(background);
            const lighter = Math.max(first, second);
            const darker = Math.min(first, second);
            return (lighter + 0.05) / (darker + 0.05);
          };

          const article = document.querySelector(".legal-document");
          const articleBackground = getComputedStyle(article).backgroundColor;
          const readContrast = selector => {
            const foreground = getComputedStyle(
              document.querySelector(selector)
            ).color;

            return {
              foreground,
              background: articleBackground,
              ratio: contrast(foreground, articleBackground)
            };
          };
          const brand = rect(".legal-brand-link");
          const toggle = rect('[data-theme-toggle-context="legal"]');

          return {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            article: rect(".legal-document"),
            brand,
            toggle,
            controls: [
              ...document.querySelectorAll(
                ".legal-site-nav a, .legal-page-footer a"
              )
            ].map(control => control.getBoundingClientRect().height),
            overlap: !(
              brand.right <= toggle.left ||
              toggle.right <= brand.left ||
              brand.bottom <= toggle.top ||
              toggle.bottom <= brand.top
            ),
            contrasts: {
              heading: readContrast(".legal-document h1"),
              copy: readContrast(".legal-document p"),
              link: readContrast(".legal-document a")
            }
          };
        });

        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
        expect(metrics.article.left).toBeGreaterThanOrEqual(0);
        expect(metrics.article.right).toBeLessThanOrEqual(metrics.clientWidth);
        expect(metrics.toggle.left).toBeGreaterThanOrEqual(0);
        expect(metrics.toggle.right).toBeLessThanOrEqual(metrics.clientWidth);
        expect(metrics.toggle.height).toBeGreaterThanOrEqual(44);
        expect(metrics.overlap).toBe(false);
        metrics.controls.forEach(height => {
          expect(height).toBeGreaterThanOrEqual(44);
        });
        Object.entries(metrics.contrasts).forEach(([name, contrast]) => {
          expect(
            contrast.ratio,
            `${legalPage.path} ${width}px ${theme} ${name} contrast ` +
              `${contrast.foreground} on ${contrast.background}`
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
