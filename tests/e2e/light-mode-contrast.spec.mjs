import {
  closeEventDrawer,
  expect,
  openEventDrawer,
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
  await expectReadable(page, ".sem-final-cta h2");
  await expectReadable(page, ".sem-final-cta > .sem-cta-inner > div:first-child > p:last-child");
  await expectReadable(page, ".sem-final-cta .sem-button");

  const homeCta = await page.locator(".sem-final-cta").evaluate((section) => {
    const sectionStyle = getComputedStyle(section);
    const card = section.querySelector(".sem-cta-inner");
    const cardStyle = getComputedStyle(card);

    return {
      sectionBackground: sectionStyle.backgroundImage,
      cardPadding: parseFloat(cardStyle.paddingInlineStart),
      cardRadius: parseFloat(cardStyle.borderRadius)
    };
  });

  expect(homeCta.sectionBackground).not.toContain("rgb(11, 29, 23)");
  expect(homeCta.cardPadding).toBeGreaterThanOrEqual(32);
  expect(homeCta.cardRadius).toBeGreaterThanOrEqual(24);

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


test("Light mode keeps Profile account and race history readable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepareApp(page, {
    openDiscoveryPanel: false
  });
  await page.evaluate(() => {
    window.SportEventMapTheme.apply("light", {
      persist: true
    });

    document.getElementById("profileEmail").textContent =
      "athlete@example.com";
    document.getElementById("profileCompletedCount").textContent =
      "3 completed";
    document.getElementById("profileEmailBtn").disabled = true;
    document.getElementById("profilePasswordBtn").disabled = true;

    const achievements = [
      ["🏁", "5 Events", "2 to go", true],
      ["🥉", "10 Events", "7 to go", false],
      ["🥈", "20 Events", "17 to go", false],
      ["🥇", "50 Events", "47 to go", false],
      ["🏆", "100 Events", "97 to go", false]
    ];
    const badgeContainer =
      document.getElementById("profileAchievementBadges");
    badgeContainer.replaceChildren(...achievements.map(item => {
      const article = document.createElement("article");
      article.className =
        "profile-achievement-card " +
        (item[3] ? "is-unlocked" : "is-locked");
      const icon = document.createElement("span");
      icon.className = "profile-achievement-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = item[0];
      const title = document.createElement("strong");
      title.textContent = item[1];
      const copy = document.createElement("small");
      copy.textContent = item[2];
      article.append(icon, title, copy);
      return article;
    }));

    document.getElementById("profileCompletedEvents").innerHTML =
      '<div class="profile-completed-empty is-success">' +
      "<strong>3 completed races</strong>" +
      "<span>Completed planned races count toward achievement badges.</span>" +
      "</div>";

    const archiveToggle =
      document.getElementById("profileCompletedArchiveToggle");
    archiveToggle.setAttribute("aria-expanded", "true");
    archiveToggle.querySelector("span").textContent =
      "Hide completed events";
    const archivePanel =
      document.getElementById("profileCompletedArchivePanel");
    archivePanel.hidden = false;
    document.querySelectorAll("[data-profile-completed-filter]")
      .forEach((button, index) => {
        const label = button.textContent;
        button.innerHTML =
          label + "<strong>" + (index ? "0" : "1") + "</strong>";
      });
    document.getElementById("profileCompletedArchiveList").innerHTML =
      '<article class="profile-completed-archive-card">' +
      '<div class="profile-completed-archive-head"><div>' +
      "<span>Marathon</span><strong>Berlin Marathon</strong>" +
      "<em>Berlin, Germany · 29.09.2024</em></div>" +
      '<span class="profile-completed-status has-result">Result saved</span>' +
      "</div>" +
      '<div class="profile-completed-archive-meta">' +
      "<span><em>Distance</em><strong>42.2 km</strong></span>" +
      "<span><em>Priority</em><strong>A Race</strong></span></div>" +
      '<div class="profile-completed-context-row">' +
      "<span><em>Goal</em><strong>Personal best</strong></span></div>" +
      '<div class="profile-completed-result-row">' +
      '<span class="profile-completed-primary-metric">' +
      "<em>Finish time</em><strong>03:45:12</strong></span></div>" +
      '<div class="profile-completed-planning-row">' +
      "<span><em>Race rating</em><strong>5 of 5</strong></span></div>" +
      '<p class="profile-completed-race-report">' +
      "Strong race with a controlled second half.</p>" +
      '<a class="profile-completed-result-link" href="#result">' +
      "Official result</a></article>";

    document.getElementById("profileModal").classList.add("open");
  });

  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "light");
  await expect(page.locator("#profileModal"))
    .toHaveClass(/open/);

  const readableSelectors = [
    ".profile-header span",
    ".profile-header h2",
    ".profile-header p",
    ".profile-section h3",
    ".profile-section-heading span",
    ".profile-account-card span",
    ".profile-account-card strong",
    ".profile-account-card p",
    ".profile-form-grid label span",
    ".profile-settings-hint",
    ".profile-achievement-card strong",
    ".profile-achievement-card small",
    ".profile-completed-empty strong",
    ".profile-completed-empty span",
    "#profileCompletedArchiveToggle",
    ".profile-completed-filterbar button",
    ".profile-completed-filterbar button strong",
    ".profile-completed-archive-head span",
    ".profile-completed-archive-head strong",
    ".profile-completed-archive-head em",
    ".profile-completed-status",
    ".profile-completed-archive-meta em",
    ".profile-completed-archive-meta strong",
    ".profile-completed-primary-metric em",
    ".profile-completed-primary-metric strong",
    ".profile-completed-planning-row em",
    ".profile-completed-planning-row strong",
    ".profile-completed-race-report",
    ".profile-completed-result-link",
    ".profile-security-section label span",
    "#profilePasswordBtn",
    "#profilePasswordResetBtn",
    ".profile-danger-btn"
  ];

  for (const selector of readableSelectors) {
    await expectReadable(page, selector);
  }

  const profileSurfaces = await page.locator("#profileModal")
    .evaluate(modal => {
      const styles = selector => {
        const style = getComputedStyle(modal.querySelector(selector));
        return {
          background: style.backgroundColor,
          color: style.color,
          opacity: style.opacity
        };
      };
      const input = modal.querySelector("#profileNewEmail");

      return {
        card: styles(".profile-card"),
        section: styles(".profile-section"),
        account: styles(".profile-account-card"),
        lockedAchievement: styles(".profile-achievement-card.is-locked"),
        disabledAction: styles("#profileEmailBtn"),
        placeholder: getComputedStyle(input, "::placeholder").color
      };
    });

  expect(profileSurfaces.card.background)
    .toBe("rgb(247, 250, 248)");
  expect(profileSurfaces.section.background)
    .toBe("rgb(255, 255, 255)");
  expect(profileSurfaces.account.background)
    .toBe("rgb(238, 245, 241)");
  expect(profileSurfaces.lockedAchievement).toMatchObject({
    background: "rgb(238, 242, 239)",
    opacity: "1"
  });
  expect(profileSurfaces.disabledAction).toMatchObject({
    background: "rgb(231, 236, 233)",
    color: "rgb(82, 103, 92)",
    opacity: "1"
  });
  expect(profileSurfaces.placeholder)
    .toBe("rgb(82, 103, 92)");

  await page.setViewportSize({
    width: 390,
    height: 844
  });
  const mobileOverflow = await page.locator(".profile-card")
    .evaluate(card => ({
      cardRight: card.getBoundingClientRect().right,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: card.scrollWidth,
      clientWidth: card.clientWidth
    }));
  expect(mobileOverflow.cardRight)
    .toBeLessThanOrEqual(mobileOverflow.viewportWidth + 1);
  expect(mobileOverflow.scrollWidth)
    .toBeLessThanOrEqual(mobileOverflow.clientWidth + 1);
});


test("Light mode keeps global status messages readable and transient", async ({ page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await prepareApp(page, {
    openDiscoveryPanel: false
  });
  await page.waitForFunction(() =>
    typeof window.showToast === "function"
  );
  await page.evaluate(() => {
    window.SportEventMapTheme.apply("light", {
      persist: true
    });
    window.showToast(
      "Season saved",
      "Your event changes were saved successfully."
    );
  });

  const toast = page.locator(".app-toast");
  await expect(toast).toHaveClass(/is-visible/);
  await expectReadable(page, ".app-toast strong");
  await expectReadable(page, ".app-toast span");

  const toastStyles = await toast.evaluate(element => {
    const style = getComputedStyle(element);
    const title = getComputedStyle(element.querySelector("strong"));
    const message = getComputedStyle(element.querySelector("span"));
    const stack = element.parentElement;
    const stackRect = stack.getBoundingClientRect();

    return {
      background: style.backgroundColor,
      borderLeft: style.borderLeftColor,
      titleColor: title.color,
      messageColor: message.color,
      stackLeft: stackRect.left,
      stackRight: stackRect.right,
      viewportWidth: document.documentElement.clientWidth
    };
  });

  expect(toastStyles).toMatchObject({
    background: "rgba(255, 255, 255, 0.98)",
    borderLeft: "rgb(21, 128, 61)",
    titleColor: "rgb(18, 32, 25)",
    messageColor: "rgb(64, 86, 74)"
  });
  expect(toastStyles.stackLeft).toBeGreaterThanOrEqual(13);
  expect(toastStyles.stackRight)
    .toBeLessThanOrEqual(toastStyles.viewportWidth - 13);

  await expect(toast).toHaveCount(0, {
    timeout: 3500
  });
});


test("Light mode keeps both Add Event select fields consistent", async ({ page }) => {
  await page.setViewportSize({
    width: 1280,
    height: 900
  });
  await prepareApp(page, {
    openDiscoveryPanel: false
  });
  await page.evaluate(() => {
    window.SportEventMapTheme.apply("light", {
      persist: true
    });
    document.getElementById("eventModal").classList.add("open");
  });

  await expect(page.locator("#eventModal"))
    .toHaveClass(/open/);
  await expectReadable(page, "#eventModal h2");
  await expectReadable(page, "#eventSportInput");
  await expectReadable(page, "#eventCourseTypeInput");

  const selectStyles = await page.locator(
    "#eventSportInput, #eventCourseTypeInput"
  ).evaluateAll(selects => selects.map(select => {
    const style = getComputedStyle(select);
    const optionStyle = getComputedStyle(select.options[0]);

    return {
      id: select.id,
      background: style.backgroundColor,
      color: style.color,
      border: style.borderColor,
      optionBackground: optionStyle.backgroundColor,
      optionColor: optionStyle.color
    };
  }));

  expect(selectStyles).toEqual([
    {
      id: "eventSportInput",
      background: "rgb(248, 251, 249)",
      color: "rgb(18, 32, 25)",
      border: "rgba(15, 23, 42, 0.16)",
      optionBackground: "rgb(255, 255, 255)",
      optionColor: "rgb(18, 32, 25)"
    },
    {
      id: "eventCourseTypeInput",
      background: "rgb(248, 251, 249)",
      color: "rgb(18, 32, 25)",
      border: "rgba(15, 23, 42, 0.16)",
      optionBackground: "rgb(255, 255, 255)",
      optionColor: "rgb(18, 32, 25)"
    }
  ]);

  await page.locator("#eventSportInput").focus();
  const focusedStyle = await page.locator("#eventSportInput")
    .evaluate(select => {
      const style = getComputedStyle(select);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color
      };
    });
  expect(focusedStyle).toEqual({
    background: "rgb(255, 255, 255)",
    border: "rgb(21, 128, 61)",
    color: "rgb(18, 32, 25)"
  });

  await page.setViewportSize({
    width: 390,
    height: 844
  });
  const modalOverflow = await page.locator(".event-modal-card")
    .evaluate(card => ({
      left: card.getBoundingClientRect().left,
      right: card.getBoundingClientRect().right,
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: card.scrollWidth,
      clientWidth: card.clientWidth
    }));
  expect(modalOverflow.left).toBeGreaterThanOrEqual(7);
  expect(modalOverflow.right)
    .toBeLessThanOrEqual(modalOverflow.viewportWidth - 7);
  expect(modalOverflow.scrollWidth)
    .toBeLessThanOrEqual(modalOverflow.clientWidth + 1);
});


test("Light mode keeps Discovery footer, popup and drawer readable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const run = fixtureByName["SEM E2E Future Run"];

  await prepareApp(page, {
    openDiscoveryPanel: false
  });
  await page.evaluate(() => window.SportEventMapTheme.apply("light", { persist: true }));

  await expectReadable(page, "#discoveryFooter #legalLinks a");
  await expectReadable(page, "#discoveryFooter #legalLinks button");
  await expectReadable(page, "#discoveryFooter .discovery-footer-note");

  await page.evaluate(event => {
    const popup = document.createElement("div");
    popup.id = "e2eLightPopup";
    popup.className = "leaflet-popup";
    popup.innerHTML =
      '<div class="leaflet-popup-content-wrapper">' +
        '<div class="leaflet-popup-content">' + createPopup(event) + '</div>' +
      '</div><div class="leaflet-popup-tip"></div>';
    document.querySelector("#map").append(popup);
  }, run);

  await expect(page.locator("#e2eLightPopup .leaflet-popup-content-wrapper"))
    .toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expectReadable(page, "#e2eLightPopup .popup-title");
  await expectReadable(page, "#e2eLightPopup .popup-chip");
  await expectReadable(page, "#e2eLightPopup .popup-meta-grid span");
  await expectReadable(page, "#e2eLightPopup .popup-distance");
  await expectReadable(page, "#e2eLightPopup .popup-link");
  await expectReadable(page, "#e2eLightPopup .popup-detail-link");

  await openEventDrawer(page, run.event_name);
  await expect(page.getByTestId("drawer-event-name")).toBeVisible();
  await expect(page.locator("#drawerContent")).toHaveCSS("opacity", "1");
  await expectReadable(page, "#eventDrawer [data-testid=\"drawer-event-name\"]");
  await expectReadable(page, "#eventDrawer .drawer-title-meta");
  await expectReadable(page, "#eventDrawer .drawer-action-row button");
  await expectReadable(page, "#eventDrawer .drawer-label");
  await expectReadable(page, "#eventDrawer .drawer-overview-grid span");
  await expectReadable(page, "#eventDrawer .drawer-overview-grid strong");
  await expectReadable(page, "#eventDrawer .drawer-trust-note");
  await expectReadable(page, "#eventDrawer .drawer-button");
  await expect(page.locator("#eventDrawer .drawer-button")).toHaveCSS("position", "static");
  await closeEventDrawer(page);
});
