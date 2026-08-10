const sidebar =
  document.getElementById("sidebar");

const toggleBtn =
  document.getElementById("toggleSidebar");

const WELCOME_SEEN_KEY =
  "sportEventMap.betaWelcomeSeen";

const BETA_BANNER_DISMISSED_KEY =
  "sportEventMap.betaBannerDismissed";

const PLATFORM_ROUTES =
  new Set([
    "home",
    "discovery",
    "events",
    "planner",
    "community",
    "submit",
    "admin"
  ]);

let platformRoute =
  "home";

let suppressEventRouteUpdate =
  false;

let sidebarTransitionTimer;

let landingExitTimer;

let landingRevealTimer;

let discoveryShellStabilizationToken = 0;

function clearLandingTransitionTimers() {
  window.clearTimeout(landingExitTimer);
  window.clearTimeout(landingRevealTimer);
  landingExitTimer = undefined;
  landingRevealTimer = undefined;
}

function stabilizeDiscoveryShellForEntry() {
  const stabilizationToken =
    ++discoveryShellStabilizationToken;

  document.body.classList.add(
    "discovery-shell-stabilizing"
  );

  // Keep transitions disabled through one complete paint. Enabling them on
  // the following frame cannot animate stale sidebar or drawer dimensions.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (
        stabilizationToken !==
        discoveryShellStabilizationToken
      ) {
        return;
      }

      document.body.classList.remove(
        "discovery-shell-stabilizing"
      );
    });
  });
}

function cancelDiscoveryShellStabilization() {
  discoveryShellStabilizationToken += 1;
  document.body.classList.remove(
    "discovery-shell-stabilizing"
  );
}

function updateSidebarToggleState() {
  if (!sidebar || !toggleBtn) {
    return;
  }

  const isExpanded =
    !sidebar.classList.contains("closed");

  const actionLabel =
    isExpanded
      ? "Events & Filter schließen"
      : "Events & Filter öffnen";
  const activeFilterCount =
    Number(toggleBtn.dataset.activeFilterCount || 0);
  const accessibleLabel =
    activeFilterCount > 0
      ? `${actionLabel}, ${activeFilterCount} aktive Filter`
      : actionLabel;

  toggleBtn.setAttribute(
    "aria-expanded",
    String(isExpanded)
  );
  toggleBtn.setAttribute("aria-label", accessibleLabel);
  toggleBtn.title = accessibleLabel;
  sidebar.setAttribute(
    "aria-hidden",
    String(!isExpanded)
  );
}

function syncSidebarState() {
  if (!sidebar) {
    return;
  }

  document.body.classList.toggle(
    "sidebar-collapsed",
    sidebar.classList.contains("closed")
  );

  document.body.classList.toggle(
    "discovery-panel-open",
    !sidebar.classList.contains("closed")
  );

  updateSidebarToggleState();
}

window.updateSidebarToggleState =
  updateSidebarToggleState;

// Keep every filter trigger on the same state transition. The legacy mobile
// trigger lives in search.js, which is loaded before this file, so expose the
// canonical controller once the platform shell is ready.
window.setSidebarExpanded =
  setSidebarExpanded;

function setSidebarExpanded(expanded, options = {}) {
  if (!sidebar) {
    return;
  }

  const shouldExpand =
    Boolean(expanded);
  const wasExpanded =
    !sidebar.classList.contains("closed");

  sidebar.classList.toggle("closed", !shouldExpand);

  if (!shouldExpand) {
    document.body.classList.remove("mobile-filter-open");
  } else {
    const filterHeader =
      document.getElementById("sidebar-header");

    if (filterHeader) {
      window.requestAnimationFrame(() => {
        filterHeader.scrollTop = 0;
      });
    }
  }

  syncSidebarState();

  if (wasExpanded === shouldExpand) {
    return;
  }

  if (options.animate === false) {
    window.clearTimeout(sidebarTransitionTimer);
    document.body.classList.remove(
      "sidebar-is-transitioning"
    );
    return;
  }

  document.body.classList.add("sidebar-is-transitioning");
  window.clearTimeout(sidebarTransitionTimer);

  if (
    options.refresh !== false &&
    typeof refreshMapLayout === "function"
  ) {
    refreshMapLayout(30);
  }

  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const transitionDuration =
    reducedMotion ? 20 : 240;

  sidebarTransitionTimer = window.setTimeout(() => {
    if (
      options.refresh !== false &&
      typeof refreshMapLayout === "function"
    ) {
      refreshMapLayout();
    }

    document.body.classList.remove("sidebar-is-transitioning");
  }, transitionDuration);
}

function initBetaBannerDismissal() {
  const closeButton =
    document.getElementById("closeBetaBannerBtn");

  if (
    localStorage.getItem(BETA_BANNER_DISMISSED_KEY) === "true"
  ) {
    document.body.classList.add("beta-banner-dismissed");
  }

  if (!closeButton) {
    return;
  }

  closeButton.addEventListener("click", () => {
    const banner =
      document.getElementById("betaBanner");

    localStorage.setItem(
      BETA_BANNER_DISMISSED_KEY,
      "true"
    );

    if (banner) {
      banner.classList.add("is-hiding");

      window.setTimeout(() => {
        document.body.classList.add("beta-banner-dismissed");
        banner.classList.remove("is-hiding");
      }, 260);
    } else {
      document.body.classList.add("beta-banner-dismissed");
    }
  });
}

function closeWelcomeModal() {
  const welcomeModal =
    document.getElementById("welcomeModal");

  localStorage.setItem(
    WELCOME_SEEN_KEY,
    "true"
  );

  if (welcomeModal) {
    welcomeModal.classList.remove("open");
  }
}

function maybeShowWelcomeModal() {
  const welcomeModal =
    document.getElementById("welcomeModal");

  if (
    !welcomeModal ||
    localStorage.getItem(WELCOME_SEEN_KEY) === "true" ||
    document.body.classList.contains("landing-open")
  ) {
    return;
  }

  welcomeModal.classList.add("open");
}

function openWelcomeModal() {
  const welcomeModal =
    document.getElementById("welcomeModal");

  if (welcomeModal) {
    welcomeModal.classList.add("open");

    if (typeof trackEvent === "function") {
      trackEvent("beta_info_opened", {
        source: "manual"
      });
    }
  }
}

function setLandingBackgroundInert(isInert) {
  document
    .querySelectorAll(
      "#topbar, #platformMobileOverlay, #platformMobileMenu, #app, #eventDrawer, #floatingActions, #discoveryFooter, [data-platform-page]"
    )
    .forEach(element => {
      element.toggleAttribute("inert", isInert);

      if (isInert) {
        element.setAttribute("aria-hidden", "true");
      } else {
        element.removeAttribute("aria-hidden");
      }
    });
}

function showLandingPage(options = {}) {
  if (
    !options.keepHash &&
    window.location.hash !== "#/home"
  ) {
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#/home`
    );
  }

  clearLandingTransitionTimers();
  document.body.classList.remove("landing-revealing-app");
  document.body.classList.remove("landing-exiting");
  document.body.classList.add("landing-open");
  setLandingBackgroundInert(true);

  if (typeof trackEvent === "function") {
    trackEvent("landing_viewed", {
    page: "home"
    });
  }
}

function hideLandingPage(afterHide, options = {}) {
  const isLandingOpen =
    document.body.classList.contains("landing-open");

  localStorage.setItem("sportEventMap.landingSeen", "true");
  clearLandingTransitionTimers();

  if (
    (
      window.location.hash === "#landing" ||
      window.location.hash === "#/home"
    ) &&
    !options.keepLandingHash
  ) {
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#/discovery`
    );
  }

  if (!isLandingOpen) {
    document.body.classList.remove(
      "landing-exiting",
      "landing-revealing-app"
    );

    if (typeof afterHide === "function") {
      afterHide();
    }

    return;
  }

  const finishLandingHide = (immediate = false) => {
    document.body.classList.remove("landing-open");
    document.body.classList.remove("landing-exiting");

    if (immediate) {
      document.body.classList.remove("landing-revealing-app");
    }

    setLandingBackgroundInert(false);

    if (typeof refreshMapLayout === "function") {
      refreshMapLayout();
    }

    if (typeof trackEvent === "function") {
      trackEvent("map_viewed", {
        source: immediate
          ? "landing_direct"
          : "landing_transition",
        page: "event_map"
      });
    }

    if (typeof afterHide === "function") {
      afterHide();
    }

    if (!options.skipWelcome) {
      maybeShowWelcomeModal();
    }

    if (!immediate) {
      landingRevealTimer = window.setTimeout(() => {
        document.body.classList.remove("landing-revealing-app");
        landingRevealTimer = undefined;
      }, 260);
    }
  };

  // Leaflet must never measure or reveal the map while the landing page still
  // owns the shell layout. Discovery swaps directly to its final rectangle;
  // content readiness is communicated by the map loading overlay instead.
  if (options.immediate) {
    finishLandingHide(true);
    return;
  }

  document.body.classList.add("landing-exiting");
  document.body.classList.add("landing-revealing-app");

  landingExitTimer = window.setTimeout(() => {
    landingExitTimer = undefined;
    finishLandingHide(false);
  }, 520);
}

function closeAppOverlays() {
  document
    .querySelectorAll(
      "#eventModal, #authModal, #profileModal, #seasonPlannerModal, #adminModal, #feedbackModal, #welcomeModal, #seasonScoreInfoModal, #seasonBalanceInfoModal, #sportMixInfoModal, #trainingBlockInfoModal"
    )
    .forEach(modal => {
      modal.classList.remove("open");
    });

  const drawer =
    document.getElementById("eventDrawer");

  if (drawer) {
    drawer.classList.remove("open");
  }

  document.body.classList.remove(
    "event-list-fullscreen",
    "fullscreen-drawer-open"
  );
}

function closeEventDrawerOnly() {
  const drawer =
    document.getElementById("eventDrawer");

  if (drawer) {
    drawer.classList.remove("open");
  }

  document.body.classList.remove(
    "fullscreen-drawer-open"
  );

  if (typeof refreshMapLayout === "function") {
    refreshMapLayout(220);
  }
}

function getPlatformHashRoute(hash = window.location.hash) {
  const cleanHash =
    String(hash || "").trim();

  if (
    cleanHash === "#landing" ||
    cleanHash === "" ||
    cleanHash === "#"
  ) {
    return {
      route: "home"
    };
  }

  if (
    cleanHash === "#app" ||
    cleanHash === "#map"
  ) {
    return {
      route: "discovery"
    };
  }

  if (cleanHash.startsWith("#/event/")) {
    return {
      route: "event",
      slug:
        decodeURIComponent(
          cleanHash.replace("#/event/", "").split("?")[0]
        )
    };
  }

  if (cleanHash.startsWith("#/")) {
    const route =
      cleanHash
        .replace("#/", "")
        .split("/")[0]
        .split("?")[0];

    return {
      route:
        PLATFORM_ROUTES.has(route)
          ? route
          : "home"
    };
  }

  return {
    route: "home"
  };
}

function setPlatformRouteClasses(route) {
  document.body.classList.remove(
    "platform-route-home",
    "platform-route-discovery",
    "platform-route-events",
    "platform-route-planner",
    "platform-route-community",
    "platform-route-submit",
    "platform-route-admin",
    "platform-page-open"
  );

  document.body.classList.add(`platform-route-${route}`);

  if (
    route === "events" ||
    route === "planner" ||
    route === "community"
  ) {
    document.body.classList.add("platform-page-open");
  }
}

function closePlatformMobileMenu() {
  const menu =
    document.getElementById("platformMobileMenu");
  const overlay =
    document.getElementById("platformMobileOverlay");
  const button =
    document.getElementById("platformMenuBtn");

  document.body.classList.remove("platform-menu-open");

  if (menu) {
    menu.classList.remove("open");
  }

  if (overlay) {
    overlay.classList.remove("open");
  }

  if (button) {
    button.setAttribute("aria-expanded", "false");
  }
}

function setPlatformActiveRoute(route) {
  const activeRoute =
    route === "event"
      ? "events"
      : route;

  document
    .querySelectorAll("[data-platform-route]")
    .forEach(link => {
      const isActive =
        link.dataset.platformRoute === activeRoute;

      link.classList.toggle("active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
}

function showPlatformPage(route) {
  document
    .querySelectorAll("[data-platform-page]")
    .forEach(page => {
      page.classList.toggle(
        "active",
        page.dataset.platformPage === route
      );
    });
}

function resetDiscoveryMapAfterLayout(delay = 220, options = {}) {
  if (typeof window.activateDiscoveryMap === "function") {
    window.activateDiscoveryMap({
      restoreEventView: Boolean(options.restoreEventView)
    });
    return;
  }

  if (typeof refreshMapLayout === "function") {
    refreshMapLayout(delay);
  }

  window.setTimeout(() => {
    if (
      options.restoreEventView &&
      typeof restoreDiscoveryMapViewBeforeEvent === "function" &&
      restoreDiscoveryMapViewBeforeEvent()
    ) {
      return;
    }

    if (typeof resetDiscoveryMapView === "function") {
      resetDiscoveryMapView();
    }
  }, delay + 40);
}

function findEventByPlatformSlug(slug) {
  if (
    !slug ||
    typeof events === "undefined" ||
    !Array.isArray(events)
  ) {
    return null;
  }

  return events.find(event =>
    typeof getEventDetailSlug === "function" &&
    getEventDetailSlug(event) === slug
  );
}

function openEventRoute(slug, attempt = 0) {
  setPlatformRouteClasses("discovery");
  showPlatformPage("");
  document.body.classList.remove("landing-open");

  if (typeof window.activateDiscoveryMap === "function") {
    window.activateDiscoveryMap();
  }

  const found =
    findEventByPlatformSlug(slug);

  if (!found) {
    if (attempt < 12) {
      window.setTimeout(
        () => openEventRoute(slug, attempt + 1),
        220
      );
      return;
    }

    if (typeof showAppMessage === "function") {
      showAppMessage(
        "Event not found",
        "Dieses Event konnte in der aktuellen Event-Datenbank nicht gefunden werden."
      );
    }

    return;
  }

  suppressEventRouteUpdate = true;

  if (typeof focusEvent === "function") {
    focusEvent(found);
  }

  if (typeof openDrawer === "function") {
    openDrawer(found);
  }

  suppressEventRouteUpdate = false;
}

function openSubmitEventFlow() {
  const addEventButton =
    document.getElementById("addEventBtn");

  if (
    addEventButton &&
    getComputedStyle(addEventButton).display !== "none"
  ) {
    addEventButton.click();
    return;
  }

  if (typeof showAppMessage === "function") {
    showAppMessage(
      "Login required",
      "Bitte logge dich ein, um ein Event einzureichen."
    );
  }

  if (typeof openAuthModal === "function") {
    openAuthModal("login");
  }
}

function openAdminFlow() {
  const adminButton =
    document.getElementById("adminBtn");

  if (
    adminButton &&
    getComputedStyle(adminButton).display !== "none"
  ) {
    adminButton.click();
    return;
  }

  if (typeof showAppMessage === "function") {
    showAppMessage(
      "Admin login required",
      "Der Adminbereich ist nur für berechtigte Admin-Accounts sichtbar."
    );
  }

  if (typeof openAuthModal === "function") {
    openAuthModal("login");
  }
}

function showPlatformRoute(routeInfo, options = {}) {
  const route =
    typeof routeInfo === "string"
      ? routeInfo
      : routeInfo.route;

  platformRoute =
    route === "event"
      ? "events"
      : route;

  if (route !== "discovery") {
    cancelDiscoveryShellStabilization();
  }

  if (route !== "discovery") {
    document.body.classList.remove("mobile-filter-open");

    if (sidebar && !sidebar.classList.contains("closed")) {
      setSidebarExpanded(false, {
        refresh: false
      });
    }
  }
  if (
    route !== "planner" &&
    typeof closeSeasonPlanner === "function"
  ) {
    closeSeasonPlanner();
  }

  closePlatformMobileMenu();
  setPlatformActiveRoute(route);

  if (route === "home") {
    setPlatformRouteClasses("home");
    showPlatformPage("");
    showLandingPage({
      keepHash: true
    });
    return;
  }

  if (route === "event") {
    setPlatformActiveRoute("event");
    openEventRoute(routeInfo.slug || "");
    return;
  }

  if (route === "discovery") {
    stabilizeDiscoveryShellForEntry();
    setPlatformRouteClasses("discovery");
    showPlatformPage("");
    setSidebarExpanded(false, {
      animate: false,
      refresh: false
    });

    if (!options.keepDrawer) {
      closeEventDrawerOnly();
    }

    hideLandingPage(null, {
      immediate: true,
      keepLandingHash: true,
      skipWelcome: true
    });

    resetDiscoveryMapAfterLayout(180, {
      restoreEventView: Boolean(options.restoreEventView)
    });

    return;
  }

  hideLandingPage(null, {
    keepLandingHash: true,
    skipWelcome: true
  });

  if (route === "planner") {
    closeEventDrawerOnly();
    setPlatformRouteClasses("planner");
    showPlatformPage("planner");

    if (typeof openSeasonPlanner === "function") {
      openSeasonPlanner();
    }

    document.querySelector(".platform-pages")?.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto"
    });

    return;
  }

  if (
    route === "events" ||
    route === "community"
  ) {
    closeEventDrawerOnly();
    setPlatformRouteClasses(route);
    showPlatformPage(route);
    window.scrollTo({
      top: 0,
      left: 0,
      behavior:
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth"
    });
    return;
  }

  if (route === "submit") {
    setPlatformRouteClasses("discovery");
    showPlatformPage("");
    closeEventDrawerOnly();
    openSubmitEventFlow();
    return;
  }

  if (route === "admin") {
    setPlatformRouteClasses("discovery");
    showPlatformPage("");
    closeEventDrawerOnly();
    openAdminFlow();
  }
}

function navigateToPlatformRoute(route, options = {}) {
  const nextHash =
    route.startsWith("#")
      ? route
      : `#/${route}`;

  const nextUrl =
    `${window.location.pathname}${window.location.search}${nextHash}`;

  if (window.location.hash === nextHash) {
    showPlatformRoute(
      getPlatformHashRoute(nextHash),
      options
    );
    return;
  }

  if (options.replace) {
    history.replaceState(
      null,
      "",
      nextUrl
    );
    showPlatformRoute(
      getPlatformHashRoute(nextHash),
      options
    );
    return;
  }

  window.location.hash =
    nextHash.replace(/^#/, "");
}

function initPlatformShell() {
  const menuButton =
    document.getElementById("platformMenuBtn");
  const closeButton =
    document.getElementById("platformMenuCloseBtn");
  const menu =
    document.getElementById("platformMobileMenu");
  const overlay =
    document.getElementById("platformMobileOverlay");
  const mobileActionButtons =
    menu?.querySelectorAll("[data-platform-mobile-action]") || [];

  const syncPlatformMobileActions = () => {
    mobileActionButtons.forEach(button => {
      const target =
        document.getElementById(
          button.dataset.platformMobileAction
        );
      const isAvailable = Boolean(
        target &&
        !target.hidden &&
        target.getAttribute("aria-hidden") !== "true" &&
        target.style.display !== "none"
      );

      button.hidden = !isAvailable;

      if (isAvailable) {
        button.textContent =
          target.textContent.trim();
      }
    });
  };

  if (menuButton && menu && overlay) {
    menuButton.addEventListener("click", () => {
      syncPlatformMobileActions();

      const isOpen =
        menu.classList.toggle("open");

      overlay.classList.toggle("open", isOpen);
      document.body.classList.toggle("platform-menu-open", isOpen);
      menuButton.setAttribute(
        "aria-expanded",
        isOpen ? "true" : "false"
      );
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", closePlatformMobileMenu);
  }

  if (overlay) {
    overlay.addEventListener("click", closePlatformMobileMenu);
  }

  mobileActionButtons.forEach(button => {
    button.addEventListener("click", () => {
      const target =
        document.getElementById(
          button.dataset.platformMobileAction
        );

      closePlatformMobileMenu();
      target?.click();
    });
  });

  document
    .querySelectorAll("[data-platform-route]")
    .forEach(link => {
      link.addEventListener("click", event => {
        const route =
          link.dataset.platformRoute;

        if (!route) {
          return;
        }

        event.preventDefault();
        navigateToPlatformRoute(route);
      });
    });

  document
    .getElementById("plannerPageOpenBtn")
    ?.addEventListener("click", () => {
      if (typeof openSeasonPlanner === "function") {
        openSeasonPlanner();
      }
    });

  document
    .getElementById("plannerAuthLoginBtn")
    ?.addEventListener("click", () => {
      if (typeof openAuthModal === "function") {
        openAuthModal("login");
        return;
      }

      document.getElementById("loginBtn")?.click();
    });

  document
    .getElementById("eventWikiSearchFocusBtn")
    ?.addEventListener("click", () => {
      navigateToPlatformRoute("discovery");
      window.setTimeout(() => {
        document.getElementById("searchInput")?.focus();
      }, 260);
    });

  document
    .getElementById("communitySearchFocusBtn")
    ?.addEventListener("click", () => {
      navigateToPlatformRoute("discovery");
      window.setTimeout(() => {
        document.getElementById("searchInput")?.focus();
      }, 260);
    });

  document
    .getElementById("communitySuggestFeatureBtn")
    ?.addEventListener("click", () => {
      const feedbackButton =
        document.getElementById("feedbackBtn");

      if (feedbackButton) {
        feedbackButton.click();
      }
    });

  window.addEventListener("hashchange", () => {
    showPlatformRoute(getPlatformHashRoute());
  });

  if (
    window.location.hash === "#landing" ||
    window.location.hash === "#app" ||
    window.location.hash === "#map"
  ) {
    navigateToPlatformRoute(
      getPlatformHashRoute().route,
      { replace: true }
    );
    return;
  }

  if (!window.location.hash) {
    navigateToPlatformRoute("home", {
      replace: true
    });
    return;
  }

  showPlatformRoute(getPlatformHashRoute(), {
    keepDrawer: true
  });
}

window.updatePlatformEventRoute = function updatePlatformEventRoute(event) {
  if (
    suppressEventRouteUpdate ||
    typeof getEventDetailSlug !== "function"
  ) {
    return;
  }

  const slug =
    getEventDetailSlug(event);

  if (!slug) {
    return;
  }

  const nextHash =
    `#/event/${encodeURIComponent(slug)}`;

  if (typeof window.preparePlatformDiscoveryForEvent === "function") {
    window.preparePlatformDiscoveryForEvent();
  }

  if (window.location.hash === nextHash) {
    return;
  }

  history.pushState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`
  );

  setPlatformActiveRoute("event");
};

window.preparePlatformDiscoveryForEvent = function preparePlatformDiscoveryForEvent() {
  closePlatformMobileMenu();
  setPlatformRouteClasses("discovery");
  showPlatformPage("");
  document.body.classList.remove(
    "landing-open",
    "landing-exiting",
    "landing-revealing-app"
  );

  if (typeof refreshMapLayout === "function") {
    refreshMapLayout(120);
  }
};

window.closePlatformEventRoute = function closePlatformEventRoute() {
  if (window.location.hash.startsWith("#/event/")) {
    navigateToPlatformRoute("discovery", {
      replace: true,
      restoreEventView: true
    });
  }
};

function goToAppHome(event) {
  if (event) {
    event.preventDefault();
  }

  navigateToPlatformRoute("home");
}

function applyLandingSearch(query) {
  const searchInput =
    document.getElementById("searchInput");

  if (searchInput && query) {
    searchInput.value = query;
  }

  if (
    query &&
    typeof trackEvent === "function"
  ) {
    trackEvent("search_performed", {
      query,
      source: "landing",
      page_context: "landing"
    });
  }

  navigateToPlatformRoute("discovery");

  window.setTimeout(() => {
    if (typeof applyFilters === "function") {
      applyFilters(true);
    }
  }, 260);
}

const LANDING_THEME_KEY =
  "sportEventMapTheme";

function getLandingThemePreference() {
  return window.SportEventMapTheme
    ? window.SportEventMapTheme.getPreference()
    : "system";
}

function applyLandingTheme(theme = getLandingThemePreference()) {
  if (window.SportEventMapTheme) {
    return window.SportEventMapTheme.apply(theme);
  }

  return theme;
}

function updateLandingEventCount(eventList) {
  const sourceEvents =
    Array.isArray(eventList)
      ? eventList
      : typeof events !== "undefined" && Array.isArray(events)
        ? events
        : null;

  if (!sourceEvents) {
    return;
  }

  const formattedCount =
    new Intl.NumberFormat("en-US")
      .format(sourceEvents.length);

  document
    .querySelectorAll("[data-landing-event-count]")
    .forEach(element => {
      element.textContent = formattedCount;
    });
}

window.updateLandingEventCount =
  updateLandingEventCount;

function initLandingPage() {
  const landingPage =
    document.getElementById("landingPage");

  if (!landingPage) {
    return;
  }

  const hasSeenLanding =
    localStorage.getItem("sportEventMap.landingSeen") === "true";

  const currentHash =
    window.location.hash;

  if (
    currentHash === "#app" ||
    currentHash === "#map" ||
    currentHash === "#/discovery" ||
    currentHash.startsWith("#/event/")
  ) {
    localStorage.setItem("sportEventMap.landingSeen", "true");
    document.body.classList.remove("landing-open");
  } else if (
    currentHash === "#landing" ||
    currentHash === "#/home" ||
    currentHash === "" ||
    currentHash === "#"
  ) {
    showLandingPage({
      keepHash: true
    });
  } else if (
    currentHash.startsWith("#/events") ||
    currentHash.startsWith("#/planner") ||
    currentHash.startsWith("#/community") ||
    currentHash.startsWith("#/submit") ||
    currentHash.startsWith("#/admin")
  ) {
    localStorage.setItem("sportEventMap.landingSeen", "true");
    document.body.classList.remove("landing-open");
  } else if (!hasSeenLanding) {
    showLandingPage({
      keepHash: true
    });
  } else {
    setTimeout(maybeShowWelcomeModal, 600);
  }

  const brandHomeLink =
    document.getElementById("brandHomeLink");

  const landingFooterLink =
    document.getElementById("landingFooterLink");

  const discoverBtn =
    document.getElementById("landingDiscoverBtn");

  const seasonBtn =
    document.getElementById("landingSeasonBtn");

  const landingSubmitHeroBtn =
    document.getElementById("landingSubmitHeroBtn");

  const landingSearchInput =
    document.getElementById("landingSearchInput");

  const landingSearchBtn =
    document.getElementById("landingSearchBtn");

  const landingAddEventBtn =
    document.getElementById("homeAddEventBtn");

  const landingThemeButtons =
    document.querySelectorAll("[data-landing-theme]");

  const landingMenuButton =
    document.getElementById("landingMenuBtn");

  const landingMenuCloseButton =
    document.getElementById("landingMenuCloseBtn");

  const landingMenu =
    document.getElementById("landingMobileMenu");

  const landingMenuOverlay =
    document.getElementById("landingMenuOverlay");

  const landingAuthButtons =
    [
      document.getElementById("landingAuthBtn"),
      document.getElementById("landingMobileAuthBtn")
    ].filter(Boolean);

  applyLandingTheme();

  const translateLandingLabel = (key, fallback) =>
    typeof window.t === "function"
      ? window.t(key, fallback)
      : fallback;

  const syncLandingCtas = () => {
    if (discoverBtn) {
      discoverBtn.textContent = translateLandingLabel(
        "landing.discover",
        "Explore Events"
      );
    }

    if (seasonBtn) {
      seasonBtn.textContent = translateLandingLabel(
        "landing.openPlanner",
        "Open Season Planner"
      );
    }
  };

  syncLandingCtas();

  document.addEventListener(
    "app-language-changed",
    syncLandingCtas
  );

  updateLandingEventCount();

  let landingMenuReturnFocus = null;

  const closeLandingMenu = () => {
    if (!landingMenu || !landingMenuButton) {
      return;
    }

    landingMenu.classList.remove("open");
    landingMenuOverlay?.classList.remove("open");
    landingPage.classList.remove("menu-open");
    document.body.classList.remove("sem-menu-open");
    landingMenu.setAttribute("aria-hidden", "true");
    landingMenuButton.setAttribute("aria-expanded", "false");

    if (landingMenuReturnFocus instanceof HTMLElement) {
      landingMenuReturnFocus.focus();
      landingMenuReturnFocus = null;
    }
  };

  const openLandingMenu = () => {
    if (!landingMenu || !landingMenuButton) {
      return;
    }

    landingMenuReturnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : landingMenuButton;

    landingMenu.classList.add("open");
    landingMenuOverlay?.classList.add("open");
    landingPage.classList.add("menu-open");
    document.body.classList.add("sem-menu-open");
    landingMenu.setAttribute("aria-hidden", "false");
    landingMenuButton.setAttribute("aria-expanded", "true");

    window.setTimeout(() => {
      landingMenu
        .querySelector("a, button")
        ?.focus();
    }, 0);
  };

  landingMenuButton?.addEventListener("click", () => {
    if (landingMenu?.classList.contains("open")) {
      closeLandingMenu();
    } else {
      openLandingMenu();
    }
  });

  landingMenuCloseButton
    ?.addEventListener("click", closeLandingMenu);

  landingMenuOverlay
    ?.addEventListener("click", closeLandingMenu);

  landingMenu
    ?.querySelectorAll("a")
    .forEach(link => {
      link.addEventListener("click", closeLandingMenu);
    });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      landingMenu?.classList.contains("open")
    ) {
      closeLandingMenu();
    }
  });

  const loginButton =
    document.getElementById("loginBtn");

  const profileButton =
    document.getElementById("profileBtn");

  const isProfileAvailable = () =>
    Boolean(
      profileButton &&
      profileButton.style.display !== "none"
    );

  const syncLandingAuthButtons = () => {
    const profileAvailable = isProfileAvailable();
    const label = profileAvailable
      ? translateLandingLabel("nav.profile", "Profile")
      : translateLandingLabel("nav.login", "Login");
    const ariaLabel = profileAvailable
      ? translateLandingLabel("landing.openProfile", "Open profile")
      : translateLandingLabel("landing.logIn", "Log in");

    landingAuthButtons.forEach(button => {
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel);
    });
  };

  const activateLandingAuth = () => {
    closeLandingMenu();

    if (isProfileAvailable()) {
      profileButton?.click();
    } else {
      loginButton?.click();
    }
  };

  landingAuthButtons.forEach(button => {
    button.addEventListener("click", activateLandingAuth);
  });

  document.addEventListener(
    "app-language-changed",
    syncLandingAuthButtons
  );

  [loginButton, profileButton]
    .filter(Boolean)
    .forEach(button => {
      new MutationObserver(syncLandingAuthButtons)
        .observe(button, {
          attributes: true,
          attributeFilter: ["style", "hidden", "aria-hidden"]
        });
    });

  syncLandingAuthButtons();

  const sportTabs =
    [...document.querySelectorAll("[data-sport-tab]")];

  const sportPanels =
    [...document.querySelectorAll("[data-sport-panel]")];

  const activateSportTab = tab => {
    const sport =
      tab.dataset.sportTab;

    sportTabs.forEach(button => {
      const isActive =
        button === tab;

      button.setAttribute(
        "aria-selected",
        isActive ? "true" : "false"
      );
      button.tabIndex =
        isActive ? 0 : -1;
    });

    sportPanels.forEach(panel => {
      panel.hidden =
        panel.dataset.sportPanel !== sport;
    });
  };

  sportTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      activateSportTab(tab);
    });

    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }

      event.preventDefault();

      const direction =
        event.key === "ArrowRight" ? 1 : -1;

      const nextTab =
        sportTabs[
          (index + direction + sportTabs.length) % sportTabs.length
        ];

      activateSportTab(nextTab);
      nextTab.focus();
    });
  });

  landingPage
    .querySelectorAll("[data-landing-route]")
    .forEach(link => {
      link.addEventListener("click", event => {
        const route =
          link.dataset.landingRoute;

        if (!route) {
          return;
        }

        event.preventDefault();
        closeLandingMenu();
        navigateToPlatformRoute(route);
      });
    });

  if (brandHomeLink) {
    brandHomeLink.addEventListener("click", goToAppHome);
  }

  if (landingFooterLink) {
    landingFooterLink.addEventListener("click", event => {
      event.preventDefault();
      showLandingPage();
    });
  }

  if (discoverBtn) {
    discoverBtn.addEventListener("click", () => {
      if (typeof trackEvent === "function") {
        trackEvent("hero_cta_clicked", {
          cta: "explore_events",
          page: "landing"
        });
      }

      navigateToPlatformRoute("discovery");
    });
  }

  if (seasonBtn) {
    seasonBtn.addEventListener("click", () => {
      if (typeof trackEvent === "function") {
        trackEvent("secondary_cta_clicked", {
          cta: "plan_season",
          page: "landing"
        });
      }

      navigateToPlatformRoute("planner");
    });
  }

  if (landingSubmitHeroBtn) {
    landingSubmitHeroBtn.addEventListener("click", () => {
      navigateToPlatformRoute("submit");
    });
  }

  if (landingSearchBtn) {
    landingSearchBtn.addEventListener("click", () => {
      applyLandingSearch(
        landingSearchInput
          ? landingSearchInput.value.trim()
          : ""
      );
    });
  }

  if (landingSearchInput) {
    landingSearchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        applyLandingSearch(landingSearchInput.value.trim());
      }
    });
  }

  document
    .querySelectorAll("[data-landing-query]")
    .forEach(button => {
      button.addEventListener("click", () => {
        applyLandingSearch(button.dataset.landingQuery || "");
      });
    });

  if (landingAddEventBtn) {
    landingAddEventBtn.addEventListener("click", () => {
      navigateToPlatformRoute("submit");
    });
  }

  landingThemeButtons.forEach(button => {
    button.addEventListener("click", () => {
      const theme =
        button.dataset.landingTheme || "system";

      localStorage.setItem(
        LANDING_THEME_KEY,
        theme
      );

      applyLandingTheme(theme);
    });
  });
}

initLandingPage();

initPlatformShell();

initBetaBannerDismissal();

document
  .getElementById("closeWelcomeModal")
  ?.addEventListener("click", closeWelcomeModal);

document
  .getElementById("startWelcomeBtn")
  ?.addEventListener("click", closeWelcomeModal);

document
  .getElementById("skipWelcomeBtn")
  ?.addEventListener("click", closeWelcomeModal);

document
  .getElementById("openWelcomeBtn")
  ?.addEventListener("click", openWelcomeModal);

document
  .getElementById("legalFeedbackLink")
  ?.addEventListener("click", () => {
    const feedbackBtn =
      document.getElementById("feedbackBtn");

    if (feedbackBtn) {
      feedbackBtn.click();
    }
  });

if (typeof initEventListFullscreenControls === "function") {

  initEventListFullscreenControls();

}

if (sidebar) {

  setSidebarExpanded(false, {
    refresh: false
  });

}


// SIDEBAR TOGGLE
if (toggleBtn && sidebar) {
  toggleBtn.addEventListener("click", () => {
    setSidebarExpanded(
      sidebar.classList.contains("closed")
    );
  });
}

const closeDiscoveryPanelBtn =
  document.getElementById("closeDiscoveryPanelBtn");

function closeDiscoveryPanelAndRestoreFocus() {
  setSidebarExpanded(false);

  window.requestAnimationFrame(() => {
    toggleBtn?.focus({ preventScroll: true });
  });
}

closeDiscoveryPanelBtn?.addEventListener(
  "click",
  closeDiscoveryPanelAndRestoreFocus
);

document.addEventListener("keydown", event => {
  if (
    event.key === "Escape" &&
    sidebar &&
    !sidebar.classList.contains("closed") &&
    document.body.classList.contains("platform-route-discovery")
  ) {
    closeDiscoveryPanelAndRestoreFocus();
  }
});


// FAVORITES VIEW
let showingFavorites = false;

document
  .getElementById("favoritesBtn")
  .addEventListener("click", () => {

    showingFavorites =
      !showingFavorites;

    const btn =
      document.getElementById(
        "favoritesBtn"
      );

    if (showingFavorites) {

      btn.classList.add("active");
      btn.innerHTML =
        "&#10084;";

      const filtered =
        allMarkers.filter(item =>
          isFavorite(item.data)
        );

      if (typeof setVisibleMapMarkers === "function") {
        setVisibleMapMarkers(filtered);
      }
      else {
        markerLayer.clearLayers();

        filtered.forEach(item => {

          markerLayer.addLayer(
            item.marker
          );

        });
      }

      renderEventList(
        filtered.map(
          item => item.data
        ),
        {
          emptyTitle: "No favorites yet",
          emptyText: "Speichere Events über das Herzsymbol.",
          showReset: false
        }
      );

    }

    else {

      btn.classList.remove("active");
      btn.innerHTML =
        "&#9825;";

      applyFilters();

    }

  });


// FULLSCREEN LIST FAVORITES TOGGLE
function syncEventListFavoritesToggle() {
  const sourceButton =
    document.getElementById("favoritesBtn");

  const listButton =
    document.getElementById("eventListFavoritesToggle");

  if (!sourceButton || !listButton) {
    return;
  }

  const active =
    sourceButton.classList.contains("active");

  listButton.classList.toggle("active", active);
  listButton.setAttribute(
    "aria-pressed",
    active ? "true" : "false"
  );

  listButton.innerHTML =
    active
      ? `<span aria-hidden="true">&#10084;</span> All races`
      : `<span aria-hidden="true">&#9825;</span> Favorites`;
}

document
  .getElementById("eventListFavoritesToggle")
  ?.addEventListener("click", () => {
    document
      .getElementById("favoritesBtn")
      ?.click();

    window.setTimeout(
      syncEventListFavoritesToggle,
      0
    );
  });

document
  .getElementById("favoritesBtn")
  ?.addEventListener("click", () => {
    window.setTimeout(
      syncEventListFavoritesToggle,
      0
    );
  });

syncEventListFavoritesToggle();


// LOCATE USER
document
  .getElementById("locateBtn")
  .addEventListener("click", () => {

    navigator.geolocation.getCurrentPosition(
      position => {

        const lat =
          position.coords.latitude;

        const lng =
          position.coords.longitude;

        map.flyTo(
          [lat, lng],
          10,
          {
            duration: 1.5
          }
        );

        L.circleMarker(
          [lat, lng],
          {
            radius: 10,
            color: "#2563eb",
            fillColor: "#2563eb",
            fillOpacity: 0.4
          }
        )
        .addTo(map);

      },
      error => {
        if (typeof showAppMessage === "function") {
          showAppMessage(
            "Location unavailable",
            "Your browser could not access your location. Please check location permissions."
          );
        }
        else {
          console.warn("Location unavailable:", error);
        }
      }
    );

  });
