import {
  expect,
  openPlanner,
  prepareApp,
  selectPlannerTab,
  test
} from "./helpers/browser.mjs";
import { fixtureEvents } from "./helpers/fixtures.mjs";

function eventKey(event) {
  return [
    event.event_name,
    event.date,
    event.city,
    event.country
  ].map(value => String(value || "").trim()).join("|").toLowerCase();
}

async function expectEveryPlannerTextReadable(
  page,
  viewName,
  rootSelector = "#seasonPlannerModal"
) {
  const failures = await page.locator(rootSelector).evaluate((root) => {
    const parseColor = value => {
      const match = String(value || "").match(/rgba?\(([^)]+)\)/i);

      if (!match) return null;

      const values = match[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);

      return {
        red: values[0],
        green: values[1],
        blue: values[2],
        alpha: values.length > 3 ? values[3] : 1
      };
    };
    const composite = (front, back) => {
      const alpha = front.alpha ?? 1;

      return {
        red: front.red * alpha + back.red * (1 - alpha),
        green: front.green * alpha + back.green * (1 - alpha),
        blue: front.blue * alpha + back.blue * (1 - alpha),
        alpha: 1
      };
    };
    const luminance = color => {
      const channels = [
        color.red,
        color.green,
        color.blue
      ].map(channel => {
        const normalized = channel / 255;

        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });

      return channels[0] * 0.2126 +
        channels[1] * 0.7152 +
        channels[2] * 0.0722;
    };
    const contrastRatio = (foreground, background) => {
      const high = Math.max(
        luminance(foreground),
        luminance(background)
      );
      const low = Math.min(
        luminance(foreground),
        luminance(background)
      );

      return (high + 0.05) / (low + 0.05);
    };
    const effectiveBackground = element => {
      const layers = [];

      for (
        let current = element;
        current;
        current = current.parentElement
      ) {
        const background = parseColor(
          getComputedStyle(current).backgroundColor
        );

        if (background && background.alpha > 0) {
          layers.push(background);
        }
      }

      let result = {
        red: 255,
        green: 255,
        blue: 255,
        alpha: 1
      };

      for (
        let index = layers.length - 1;
        index >= 0;
        index -= 1
      ) {
        result = composite(layers[index], result);
      }

      return result;
    };

    return Array.from(root.querySelectorAll("*"))
      .filter(element => {
        const style = getComputedStyle(element);

        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          element.getClientRects().length === 0
        ) {
          return false;
        }

        return Array.from(element.childNodes).some(node =>
          node.nodeType === Node.TEXT_NODE &&
          node.textContent.trim()
        );
      })
      .map(element => {
        const style = getComputedStyle(element);
        const foreground = parseColor(style.color);
        const background = effectiveBackground(element);

        if (!foreground) return null;

        const contrast = contrastRatio(
          composite(foreground, background),
          background
        );

        return {
          selector: element.id
            ? "#" + element.id
            : "." + Array.from(element.classList).join("."),
          text: element.textContent
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 100),
          color: style.color,
          background: "rgb(" +
            [
              background.red,
              background.green,
              background.blue
            ].map(Math.round).join(", ") +
            ")",
          contrast: Number(contrast.toFixed(2))
        };
      })
      .filter(Boolean)
      .filter(sample => sample.contrast < 4.5);
  });

  expect(
    failures,
    viewName + " contains text below 4.5:1 contrast"
  ).toEqual([]);
}

test("Light Season Planner keeps every visible text element readable", async ({ page }) => {
  await page.setViewportSize({
    width: 1440,
    height: 900
  });
  await prepareApp(page, {
    allowPlanner: true,
    favorites: fixtureEvents.map(eventKey)
  });
  await page.evaluate(() => {
    window.SportEventMapTheme.apply("light", {
      persist: true
    });
  });
  await openPlanner(page);
  await expect(page.locator("html"))
    .toHaveAttribute("data-theme", "light");

  await selectPlannerTab(page, "overview");
  await expectEveryPlannerTextReadable(page, "Overview");

  await page.locator("#seasonOverviewWarnings").evaluate(container => {
    container.innerHTML = `
      <div class="season-warning-item high">
        <strong>5 days apart · 15 recommended</strong>
        <span>First race → Second race</span>
      </div>
      <div class="season-warning-item">
        <strong>23 days apart · 30 recommended</strong>
        <span>Second race → Third race</span>
      </div>
    `;
  });
  await expectEveryPlannerTextReadable(page, "Schedule warnings");

  const infoDialogs = [
    {
      name: "Season Score info",
      opener: "#seasonScoreInfoBtn",
      modal: "#seasonScoreInfoModal",
      closer: "#closeSeasonScoreInfo"
    },
    {
      name: "Season Balance info",
      opener: "#seasonBalanceInfoBtn",
      modal: "#seasonBalanceInfoModal",
      closer: "#closeSeasonBalanceInfo"
    },
    {
      name: "Race Mix info",
      opener: "#sportMixInfoBtn",
      modal: "#sportMixInfoModal",
      closer: "#closeSportMixInfo"
    },
    {
      name: "Training Block info",
      opener: "[data-training-block-info]",
      modal: "#trainingBlockInfoModal",
      closer: "#closeTrainingBlockInfo"
    }
  ];

  for (const infoDialog of infoDialogs) {
    await page.locator(infoDialog.opener).click();
    await expect(page.locator(infoDialog.modal))
      .toHaveClass(/open/);
    await expectEveryPlannerTextReadable(
      page,
      infoDialog.name,
      infoDialog.modal
    );
    await page.locator(infoDialog.closer).click();
    await expect(page.locator(infoDialog.modal))
      .not.toHaveClass(/open/);
  }

  await selectPlannerTab(page, "events");
  await expectEveryPlannerTextReadable(page, "Events list");

  const eventStateStyles = await page
    .getByTestId("planner-event-card")
    .evaluateAll(cards => cards.map(card => ({
      active: card.classList.contains("active"),
      past: card.classList.contains("is-past-event"),
      background: getComputedStyle(card).backgroundColor,
      opacity: getComputedStyle(card).opacity
    })));
  expect(eventStateStyles.find(state => state.active)).toMatchObject({
    background: "rgb(226, 243, 232)",
    opacity: "1"
  });
  expect(eventStateStyles.find(state => state.past)).toMatchObject({
    background: "rgb(243, 247, 244)",
    opacity: "1"
  });

  await page.getByTestId("planner-event-edit-button")
    .first()
    .click();
  await expectEveryPlannerTextReadable(page, "Event editor");

  await page.locator("#seasonEventsPanel details")
    .evaluateAll(details => details.forEach(panel => {
      panel.open = true;
    }));
  await expectEveryPlannerTextReadable(page, "Expanded event editor");

  const detailToggleStyle = await page
    .locator("#seasonEventsPanel details summary")
    .first()
    .evaluate(summary => {
      const toggle = getComputedStyle(summary, "::after");

      return {
        background: toggle.backgroundColor,
        color: toggle.color
      };
    });
  expect(detailToggleStyle).toEqual({
    background: "rgb(238, 245, 241)",
    color: "rgb(20, 83, 45)"
  });

  const removeButtonStyle = await page
    .getByTestId("planner-remove-event")
    .evaluate(button => {
      const style = getComputedStyle(button);

      return {
        background: style.backgroundColor,
        color: style.color
      };
    });
  expect(removeButtonStyle).toEqual({
    background: "rgb(254, 226, 226)",
    color: "rgb(153, 27, 27)"
  });

  await selectPlannerTab(page, "calendar");
  await expectEveryPlannerTextReadable(page, "Calendar");
});
