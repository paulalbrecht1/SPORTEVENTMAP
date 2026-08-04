import { expect, test } from "@playwright/test";

const legalPages = [
  {
    path: "/imprint.html",
    englishTitle: "Legal notice",
    germanTitle: "Impressum",
    englishCopy: "Liability for content",
    germanCopy: "Haftung für Inhalte"
  },
  {
    path: "/privacy.html",
    englishTitle: "Privacy policy",
    germanTitle: "Datenschutzerklärung",
    englishCopy: "Rights of data subjects",
    germanCopy: "Rechte betroffener Personen"
  },
  {
    path: "/legal.html",
    englishTitle: "Terms of use",
    germanTitle: "Nutzungsbedingungen",
    englishCopy: "Use of the platform",
    germanCopy: "Nutzung der Plattform"
  }
];

test("footer pages follow the saved English and German language", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("sportEventMapLanguage")) {
      localStorage.setItem("sportEventMapLanguage", "de");
    }
  });

  for (const legalPage of legalPages) {
    await page.goto(legalPage.path);

    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.locator("h1")).toHaveText(legalPage.germanTitle);
    await expect(page.locator("main")).toContainText(legalPage.germanCopy);
    await expect(page.locator(".legal-page-footer")).toContainText("Datenschutz");
    await expect(page.locator(".legal-page-footer")).toContainText("Nutzungsbedingungen");

    await page.evaluate(() => {
      localStorage.setItem("sportEventMapLanguage", "en");
    });
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("h1")).toHaveText(legalPage.englishTitle);
    await expect(page.locator("main")).toContainText(legalPage.englishCopy);
    await expect(page.locator(".legal-page-footer")).toContainText("Privacy");
    await expect(page.locator(".legal-page-footer")).toContainText("Terms");

    await page.evaluate(() => {
      localStorage.setItem("sportEventMapLanguage", "de");
    });
  }
});
