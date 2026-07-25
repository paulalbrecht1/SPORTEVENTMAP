(function initializeSportEventMapTheme() {
  "use strict";

  const STORAGE_KEY = "sportEventMapTheme";
  const LEGACY_STORAGE_KEY = "sportEventMap.landingTheme";
  const VALID_PREFERENCES = new Set(["system", "light", "dark"]);
  const systemThemeQuery =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  function readStoredValue(key) {
    try {
      return localStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function writeStoredValue(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_error) {
      // Theme changes remain usable even when storage is unavailable.
    }
  }

  function getPreference() {
    const stored =
      readStoredValue(STORAGE_KEY) ||
      readStoredValue(LEGACY_STORAGE_KEY) ||
      "system";

    return VALID_PREFERENCES.has(stored)
      ? stored
      : "system";
  }

  function resolveTheme(preference = getPreference()) {
    if (preference === "light" || preference === "dark") {
      return preference;
    }

    return systemThemeQuery && systemThemeQuery.matches
      ? "dark"
      : "light";
  }

  function getInterfaceLanguage() {
    return readStoredValue("sportEventMapLanguage") === "de"
      ? "de"
      : "en";
  }

  function getToggleCopy(resolvedTheme) {
    const useGerman = getInterfaceLanguage() === "de";
    const targetTheme = resolvedTheme === "dark" ? "light" : "dark";

    if (useGerman) {
      return targetTheme === "light"
        ? "Zum hellen Modus wechseln"
        : "Zum dunklen Modus wechseln";
    }

    return targetTheme === "light"
      ? "Switch to light mode"
      : "Switch to dark mode";
  }

  function createToggleButton(context = "default") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "global-theme-toggle";
    button.dataset.themeToggle = "";
    button.dataset.themeToggleContext = context;
    button.innerHTML =
      '<span class="global-theme-toggle-track" aria-hidden="true">' +
        '<span class="global-theme-toggle-icon global-theme-toggle-sun">' +
          '<svg viewBox="0 0 24 24" focusable="false">' +
            '<circle cx="12" cy="12" r="3.5"></circle>' +
            '<path d="M12 2.5V5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"></path>' +
          '</svg>' +
        '</span>' +
        '<span class="global-theme-toggle-icon global-theme-toggle-moon">' +
          '<svg viewBox="0 0 24 24" focusable="false">' +
            '<path d="M20 15.2A8.4 8.4 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z"></path>' +
          '</svg>' +
        '</span>' +
      '</span>';
    return button;
  }

  function insertToggle(selector, context, placement = "prepend") {
    const host = document.querySelector(selector);

    if (
      !host ||
      host.querySelector(
        '[data-theme-toggle-context="' + context + '"]'
      )
    ) {
      return;
    }

    const button = createToggleButton(context);

    if (placement === "before-last" && host.lastElementChild) {
      host.insertBefore(button, host.lastElementChild);
    } else if (placement === "append") {
      host.appendChild(button);
    } else {
      host.prepend(button);
    }
  }

  function ensureControls() {
    insertToggle(".sem-header-actions", "landing-desktop", "prepend");
    insertToggle(".sem-mobile-menu-head", "landing-mobile", "before-last");
    insertToggle("#authArea", "platform-desktop", "prepend");
    insertToggle(".platform-mobile-menu-header", "platform-mobile", "before-last");
    insertToggle(".event-detail-header", "event-detail", "before-last");
    insertToggle(".legal-page-content", "legal", "prepend");
    bindControls();
    updateControls();
  }

  function updateControls(resolvedTheme = resolveTheme()) {
    const label = getToggleCopy(resolvedTheme);

    document
      .querySelectorAll("[data-theme-toggle]")
      .forEach(button => {
        button.dataset.themeState = resolvedTheme;
        button.setAttribute(
          "aria-pressed",
          resolvedTheme === "dark" ? "true" : "false"
        );
        button.setAttribute("aria-label", label);
        button.title = label;
      });
  }

  function applyTheme(preference = getPreference(), options = {}) {
    const normalizedPreference =
      VALID_PREFERENCES.has(preference)
        ? preference
        : "system";
    const resolvedTheme =
      resolveTheme(normalizedPreference);

    document.documentElement.dataset.theme =
      resolvedTheme;
    document.documentElement.dataset.themePreference =
      normalizedPreference;
    document.documentElement.style.colorScheme =
      resolvedTheme;

    if (document.body) {
      document.body.dataset.theme =
        resolvedTheme;
      document.body.dataset.landingTheme =
        normalizedPreference;
      document.body.dataset.landingResolvedTheme =
        resolvedTheme;
      document.body.classList.toggle(
        "landing-theme-dark",
        resolvedTheme === "dark"
      );
      document.body.classList.toggle(
        "landing-theme-light",
        resolvedTheme === "light"
      );
    }

    if (options.persist) {
      writeStoredValue(
        STORAGE_KEY,
        normalizedPreference
      );
      writeStoredValue(
        LEGACY_STORAGE_KEY,
        normalizedPreference
      );
    }

    updateControls(resolvedTheme);

    window.dispatchEvent(
      new CustomEvent("sport-event-map-theme-changed", {
        detail: {
          preference: normalizedPreference,
          theme: resolvedTheme
        }
      })
    );

    return resolvedTheme;
  }

  function toggleTheme() {
    const currentTheme =
      document.documentElement.dataset.theme ||
      resolveTheme();
    const nextTheme =
      currentTheme === "dark" ? "light" : "dark";

    return applyTheme(nextTheme, {
      persist: true
    });
  }

  function bindControls() {
    document
      .querySelectorAll("[data-theme-toggle]")
      .forEach(button => {
        if (button.dataset.themeBound === "true") {
          return;
        }

        button.dataset.themeBound = "true";
        button.addEventListener("click", toggleTheme);
      });
  }

  window.SportEventMapTheme = {
    storageKey: STORAGE_KEY,
    getPreference,
    resolve: resolveTheme,
    apply: applyTheme,
    toggle: toggleTheme,
    bind: bindControls,
    ensureControls,
    createToggleButton
  };

  applyTheme(getPreference());

  const initializeControls = () => {
    applyTheme(getPreference());
    ensureControls();
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeControls,
      { once: true }
    );
  } else {
    initializeControls();
  }

  if (systemThemeQuery) {
    systemThemeQuery.addEventListener("change", () => {
      if (getPreference() === "system") {
        applyTheme("system");
      }
    });
  }

  window.addEventListener("storage", event => {
    if (
      event.key === STORAGE_KEY ||
      event.key === LEGACY_STORAGE_KEY
    ) {
      applyTheme(getPreference());
    }
  });

  document.addEventListener(
    "app-language-changed",
    () => updateControls()
  );

  window.addEventListener(
    "sport-event-map-detail-languagechange",
    () => updateControls()
  );
})();
