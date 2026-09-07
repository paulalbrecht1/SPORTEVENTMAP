// Reuse the same results and controls in a dedicated phone list. Moving the
// nodes preserves their listeners, favorites and search state across rotation.
(() => {
  const phone = window.matchMedia(
    "(max-width: 767px), (max-width: 960px) and (max-height: 500px) and (orientation: landscape)"
  );
  const body = document.body;
  const landscape = window.matchMedia("(max-width: 960px) and (max-height: 500px) and (orientation: landscape)");
  const views = document.getElementById("mobileDiscoveryViews");
  const viewAnchor = document.createComment("Phone view switch portrait position");
  views.before(viewAnchor);
  const sidebar = document.getElementById("sidebar");
  const results = document.getElementById("mobileDiscoveryResults");
  const mapButton = document.getElementById("mobileMapViewBtn");
  const listButton = document.getElementById("mobileListViewBtn");
  const search = document.getElementById("searchInput");
  const apply = document.getElementById("applyMobileFiltersBtn");
  const actions = apply.closest(".filter-actions-row");
  const actionAnchor = document.createComment("Filter actions desktop position");
  actions.before(actionAnchor);
  const resultNodes = ["eventListToolbar", "eventList", "eventListPagination"]
    .map(id => document.getElementById(id));
  const resultAnchor = document.createComment("Event results desktop position");
  resultNodes[0].before(resultAnchor);
  let view = "map";

  function translateControls() {
    const de = window.getAppLanguage?.() === "de";
    const count = document.getElementById("eventListSummary").textContent.match(/\d+/)?.[0] || "0";
    const countLabel = document.getElementById("mobileResultCount");
    if (countLabel.textContent !== count) countLabel.textContent = count;
    mapButton.textContent = de ? "Karte" : "Map";
    document.getElementById("mobileListViewLabel").textContent = de ? "Liste" : "List";
    listButton.setAttribute("aria-label", de ? `Liste, ${count} Events` : `List, ${count} events`);
    document.getElementById("mobileDiscoveryViews").setAttribute("aria-label", de ? "Eventansicht" : "Event view");
    results.setAttribute("aria-label", de ? "Suchergebnisse" : "Event results");
    search.setAttribute("aria-label", de ? "Events suchen" : "Search events");
    if (phone.matches) {
      apply.textContent = de ? `${count} Events anzeigen` : `Show ${count} events`;
      document.getElementById("discoveryPanelTitle").textContent = de ? "Events filtern" : "Filter events";
    }
  }

  function syncVisibility() {
    const isList = phone.matches && view === "list";
    const filtersOpen = body.classList.contains("discovery-panel-open");
    body.classList.toggle("mobile-discovery-list", isList);
    results.hidden = !isList || filtersOpen;
    mapButton.setAttribute("aria-pressed", String(!isList));
    listButton.setAttribute("aria-pressed", String(isList));
    document.getElementById("mobileDiscoveryViews").inert = filtersOpen;
  }

  function setView(nextView) {
    if (!phone.matches) return;
    view = nextView;
    syncVisibility();
    if (view === "map" && typeof refreshMapLayout === "function") {
      refreshMapLayout();
    }
  }

  function adaptToViewport() {
    if (landscape.matches) document.getElementById("topbar").append(views);
    else viewAnchor.after(views);
    if (phone.matches) {
      // Desktop fullscreen must not carry its layout into the phone sheet.
      const wasPaginated = body.classList.contains("event-list-fullscreen");
      body.classList.remove("event-list-fullscreen", "fullscreen-drawer-open");
      if (resultNodes[0].parentElement !== results) results.append(...resultNodes);
      if (actions.parentElement !== sidebar) sidebar.append(actions);
      if (wasPaginated && typeof renderEventList === "function") {
        renderEventList(currentRenderedEvents);
      }
    } else {
      resultAnchor.after(...resultNodes);
      actionAnchor.after(actions);
      apply.textContent = window.t?.("filter.applyFilters") || "Apply filters";
      document.getElementById("discoveryPanelTitle").textContent = "Events & Filter";
    }
    window.setSidebarExpanded?.(!sidebar.classList.contains("closed"), {
      animate: false, focusPanel: false, refresh: false
    });
    syncVisibility();
    translateControls();
    if (typeof refreshMapLayout === "function") refreshMapLayout();
  }

  mapButton.addEventListener("click", () => setView("map"));
  listButton.addEventListener("click", () => setView("list"));
  apply.addEventListener("click", () => setView("list"));
  search.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !phone.matches) return;
    // Enter commits the current search and releases the software keyboard.
    if (typeof flushFilterApplication === "function") flushFilterApplication();
    window.setSidebarExpanded?.(false);
    search.blur();
    setView("list");
    listButton.focus({ preventScroll: true });
  });
  phone.addEventListener("change", adaptToViewport);
  landscape.addEventListener("change", adaptToViewport);
  new MutationObserver(syncVisibility).observe(body, {
    attributes: true, attributeFilter: ["class"]
  });
  new MutationObserver(translateControls).observe(document.getElementById("eventListSummary"), {
    childList: true, characterData: true, subtree: true
  });
  document.addEventListener("app-language-changed", translateControls);
  adaptToViewport();
})();
