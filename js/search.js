let currentFilter = "All";
let selectedSportFilters = [];
let selectedDistanceFilters = [];
let searchAnalyticsTimer = null;
let lastTrackedSearchAt = 0;
let invalidRangeNotified = false;
let searchLanguageListenerInitialized = false;

function getActiveFilterAnalytics() {
  return {
    sports:
      selectedSportFilters.slice(),
    distances:
      selectedDistanceFilters.slice(),
    date:
      document.getElementById("dateFilter")?.value || "all",
    country:
      document.getElementById("countryFilter")?.value || "all",
    sort:
      document.getElementById("sortSelect")?.value || "date",
    from:
      document.getElementById("dateFromFilter")?.value || "",
    to:
      document.getElementById("dateToFilter")?.value || ""
  };
}

function trackSearchUsedDebounced() {
  clearTimeout(searchAnalyticsTimer);

  searchAnalyticsTimer =
    setTimeout(() => {
      const searchValue =
        document
          .getElementById("searchInput")
          ?.value
          .trim();

      if (
        searchValue &&
        searchValue.length > 1 &&
        Date.now() - lastTrackedSearchAt > 1800 &&
        typeof trackEvent === "function"
      ) {
        const visibleCards =
          document.querySelectorAll(".event-card").length;

        trackEvent("search_performed", {
          query: searchValue,
          results_count: visibleCards,
          active_filters: getActiveFilterAnalytics(),
          page_context: document.body.classList.contains("event-list-fullscreen")
            ? "fullscreen_list"
            : "event_map"
        });

        lastTrackedSearchAt =
          Date.now();
      }
    }, 900);
}

function trackFilterUsed(filterType, value = "") {
  if (typeof trackEvent === "function") {
    trackEvent(
      filterType === "sort"
        ? "sort_changed"
        : "filter_changed",
      {
      filter_type: filterType,
      value,
      active_filters: getActiveFilterAnalytics()
    }
    );
  }
}

function getSelectedSportFilters() {
  return selectedSportFilters;
}

function syncSportFilterButtons() {
  const hasSpecificFilters =
    selectedSportFilters.length > 0;

  document
    .querySelectorAll(".filter-chip")
    .forEach(button => {
      const filter =
        button.dataset.filter;

      button.classList.toggle(
        "active",
        filter === "All"
          ? !hasSpecificFilters
          : selectedSportFilters.includes(filter)
      );
    });

  currentFilter =
    hasSpecificFilters
      ? selectedSportFilters.join(", ")
      : "All";
}

const DISTANCE_FILTER_LABELS = {
  "5k": "5K",
  "10k": "10K",
  "half": "Half Marathon",
  "marathon": "Marathon",
  "ultra": "Ultra",
  "tri-sprint": "Sprint Tri",
  "tri-olympic": "Olympic Tri",
  "tri-middle": "Middle Tri",
  "tri-full": "Full Tri"
};

const SEARCH_MONTHS = {
  january: 0,
  januar: 0,
  jan: 0,
  february: 1,
  februar: 1,
  feb: 1,
  march: 2,
  maerz: 2,
  märz: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  mai: 4,
  june: 5,
  juni: 5,
  jun: 5,
  july: 6,
  juli: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  october: 9,
  oktober: 9,
  oct: 9,
  okt: 9,
  november: 10,
  nov: 10,
  december: 11,
  dezember: 11,
  dec: 11,
  dez: 11
};

const SEARCH_STOP_WORDS =
  new Set([
    "im",
    "in",
    "am",
    "an",
    "der",
    "die",
    "das",
    "den",
    "dem",
    "und",
    "and",
    "the",
    "event",
    "events",
    "race",
    "rennen",
    "lauf",
    "laeufe",
    "läufe",
    "run",
    "running",
    "kilometer",
    "km"
  ]);

function getSearchTranslation(key, fallback, replacements = {}) {
  if (typeof window.tFormat === "function") {
    return window.tFormat(key, replacements, fallback);
  }

  if (typeof window.t === "function") {
    return window.t(key, fallback);
  }

  return Object.entries(replacements).reduce(
    (text, [name, value]) =>
      text.replaceAll(`{${name}}`, value),
    fallback
  );
}

function getSearchMonthLabel(month) {
  const fallbackMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  return getSearchTranslation(
    `month.${month}`,
    fallbackMonths[month] || ""
  );
}

function normalizeSmartSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function removeSmartPattern(text, pattern) {
  pattern.lastIndex = 0;

  return text
    .replace(pattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSmartSearch(query) {
  let text =
    normalizeSmartSearchText(query);

  const parsed = {
    hasQuery: Boolean(text),
    textTokens: [],
    months: [],
    years: [],
    sports: [],
    distances: []
  };

  if (!text) {
    return parsed;
  }

  Object.entries(SEARCH_MONTHS)
    .forEach(([name, month]) => {
      const pattern =
        new RegExp(`(^|\\s)${name}(?=\\s|$)`, "g");

      if (pattern.test(text)) {
        addUnique(parsed.months, month);
        text = removeSmartPattern(text, pattern);
      }
    });

  text = text.replace(/\b(20\d{2})\b/g, match => {
    addUnique(parsed.years, Number(match));
    return " ";
  });

  const distanceRules = [
    {
      filter: "tri-middle",
      pattern: /\b(70\.3|middle tri|middle distance|mitteldistanz|half ironman)\b/g,
      sport: "Triathlon"
    },
    {
      filter: "tri-sprint",
      pattern: /\b(sprint tri|sprint triathlon)\b/g,
      sport: "Triathlon"
    },
    {
      filter: "tri-olympic",
      pattern: /\b(olympic tri|olympic triathlon|standard distance|kurzdistanz)\b/g,
      sport: "Triathlon"
    },
    {
      filter: "tri-full",
      pattern: /\b(full tri|full triathlon|full distance|ironman)\b/g,
      sport: "Triathlon"
    },
    {
      filter: "half",
      pattern: /\b(half marathon|halbmarathon|21\s?km|21\s?kilometer|13\.1\s?miles?)\b/g,
      sport: "Running"
    },
    {
      filter: "5k",
      pattern: /\b(5\s?k|5\s?km|5\s?kilometer|5 kilometer|3\.1\s?miles?)\b/g,
      sport: "Running"
    },
    {
      filter: "10k",
      pattern: /\b(10\s?k|10\s?km|10\s?kilometer|10 kilometer|6\.2\s?miles?)\b/g,
      sport: "Running"
    },
    {
      filter: "ultra",
      pattern: /\b(ultra|ultramarathon|backyard|50\s?km|100\s?km|100\s?miles?)\b/g,
      sport: "Ultramarathon"
    },
    {
      filter: "marathon",
      pattern: /\bmarathon\b/g,
      sport: "Running"
    }
  ];

  distanceRules.forEach(rule => {
    if (rule.pattern.test(text)) {
      addUnique(parsed.distances, rule.filter);
      addUnique(parsed.sports, rule.sport);
      text = removeSmartPattern(text, rule.pattern);
    }
  });

  const sportRules = [
    {
      sport: "Triathlon",
      pattern: /\b(triathlon|tri)\b/g
    },
    {
      sport: "Ultramarathon",
      pattern: /\b(ultra|ultramarathon|trailrunning|trail)\b/g
    },
    {
      sport: "Running",
      pattern: /\b(running|run|lauf|laufen)\b/g
    }
  ];

  sportRules.forEach(rule => {
    if (rule.pattern.test(text)) {
      addUnique(parsed.sports, rule.sport);
      text = removeSmartPattern(text, rule.pattern);
    }
  });

  parsed.textTokens =
    text
      .split(" ")
      .map(token => token.trim())
      .filter(token =>
        token &&
        !SEARCH_STOP_WORDS.has(token)
      );

  return parsed;
}

function eventMatchesSmartSearch(event, smartSearch) {
  if (!smartSearch.hasQuery) {
    return true;
  }

  const searchable =
    normalizeSmartSearchText(`
      ${event.event_name}
      ${event.city}
      ${event.country}
      ${event.sport}
      ${event.distance}
    `);

  const matchesText =
    smartSearch.textTokens.length === 0 ||
    smartSearch.textTokens.every(token =>
      searchable.includes(token)
    );

  if (!matchesText) {
    return false;
  }

  if (smartSearch.sports.length) {
    const sport =
      String(event.sport || "");

    if (!smartSearch.sports.includes(sport)) {
      return false;
    }
  }

  if (smartSearch.distances.length) {
    const distanceText =
      normalizeDistanceSearchText(event);

    const contextText =
      normalizeDistanceContextText(event);

    const matchesSmartDistance =
      smartSearch.distances.some(filter =>
        distanceTextMatchesFilter(
          distanceText,
          contextText,
          filter
        )
      );

    if (!matchesSmartDistance) {
      return false;
    }
  }

  if (
    smartSearch.months.length ||
    smartSearch.years.length
  ) {
    const eventDate =
      parseGermanDate(event.date);

    if (!eventDate) {
      return false;
    }

    if (
      smartSearch.months.length &&
      !smartSearch.months.includes(
        eventDate.getMonth()
      )
    ) {
      return false;
    }

    if (
      smartSearch.years.length &&
      !smartSearch.years.includes(
        eventDate.getFullYear()
      )
    ) {
      return false;
    }
  }

  return true;
}

function escapeSuggestionHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSmartSearchTitle(smartSearch, fallback) {
  const parts = [];
  const orLabel =
    getSearchTranslation("search.or", "or");
  const inLabel =
    getSearchTranslation("search.in", "in");

  if (smartSearch.distances.length) {
    parts.push(
      smartSearch.distances
        .map(filter =>
          DISTANCE_FILTER_LABELS[filter] || filter
        )
        .join(` ${orLabel} `)
    );
  }

  else if (smartSearch.sports.length) {
    parts.push(
      smartSearch.sports.join(` ${orLabel} `)
    );
  }

  if (smartSearch.months.length) {
    parts.push(
      `${inLabel} ${smartSearch.months
        .map(getSearchMonthLabel)
        .join(` ${orLabel} `)}`
    );
  }

  if (smartSearch.years.length) {
    parts.push(
      smartSearch.years.join(` ${orLabel} `)
    );
  }

  if (!parts.length) {
    return fallback.trim();
  }

  return parts.join(" ");
}

function getSearchSuggestionItems(query) {
  const trimmedQuery =
    String(query || "").trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const smartSearch =
    parseSmartSearch(trimmedQuery);

  const suggestions = [];

  if (
    smartSearch.distances.length ||
    smartSearch.months.length ||
    smartSearch.years.length ||
    smartSearch.sports.length
  ) {
    suggestions.push({
      type: getSearchTranslation(
        "search.smart",
        "Smart search"
      ),
      title: getSmartSearchTitle(
        smartSearch,
        trimmedQuery
      ),
      meta: getSearchTranslation(
        "search.smartMeta",
        "Search by distance, sport, month or year"
      ),
      query: trimmedQuery
    });
  }

  const markers =
    Array.isArray(window.allMarkers)
      ? window.allMarkers
      : allMarkers || [];

  markers
    .filter(item =>
      item &&
      item.data &&
      eventMatchesSmartSearch(
        item.data,
        smartSearch
      )
    )
    .slice(0, 5)
    .forEach(item => {
      const event =
        item.data;

      suggestions.push({
        type: getSearchTranslation(
          "search.event",
          "Event"
        ),
        title: event.event_name,
        meta: [
          event.date,
          event.city,
          event.distance
        ].filter(Boolean).join(" · "),
        query: event.event_name
      });
    });

  const normalizedQuery =
    normalizeSmartSearchText(trimmedQuery);

  const citySuggestions = [];

  markers.forEach(item => {
    const event =
      item && item.data;

    if (!event || !event.city) {
      return;
    }

    const city =
      String(event.city).trim();

    if (
      normalizeSmartSearchText(city)
        .includes(normalizedQuery) &&
      !citySuggestions.includes(city)
    ) {
      citySuggestions.push(city);
    }
  });

  citySuggestions
    .slice(0, 3)
    .forEach(city => {
      suggestions.push({
        type: getSearchTranslation(
          "search.city",
          "City"
        ),
        title: getSearchTranslation(
          "search.eventsIn",
          `Events in ${city}`,
          { city }
        ),
        meta: getSearchTranslation(
          "search.locationMeta",
          "Search by location"
        ),
        query: city
      });
    });

  if (!suggestions.length) {
    suggestions.push({
      type: getSearchTranslation(
        "search.try",
        "Try"
      ),
      title: getSearchTranslation(
        "search.tryTitle",
        "Try 10K, Half Marathon, Triathlon or November"
      ),
      meta: getSearchTranslation(
        "search.tryMeta",
        "Search by distance, sport, city, month or year"
      ),
      query: trimmedQuery
    });
  }

  return suggestions.slice(0, 6);
}

function hideSearchSuggestions() {
  const suggestions =
    document.getElementById("searchSuggestions");

  if (!suggestions) {
    return;
  }

  suggestions.classList.remove("open");
  suggestions.innerHTML = "";
}

function updateSearchSuggestions() {
  const input =
    document.getElementById("searchInput");

  const suggestions =
    document.getElementById("searchSuggestions");

  if (!input || !suggestions) {
    return;
  }

  const items =
    getSearchSuggestionItems(input.value);

  if (!items.length) {
    hideSearchSuggestions();
    return;
  }

  suggestions.innerHTML =
    items
      .map(item => `
        <button
          type="button"
          class="search-suggestion-item"
          data-search-suggestion="${escapeSuggestionHTML(item.query)}"
        >
          <span>${escapeSuggestionHTML(item.type)}</span>
          <strong>${escapeSuggestionHTML(item.title)}</strong>
          <em>${escapeSuggestionHTML(item.meta)}</em>
        </button>
      `)
      .join("");

  suggestions.classList.add("open");
}

function applySearchSuggestion(query) {
  const input =
    document.getElementById("searchInput");

  if (!input) {
    return;
  }

  input.value = query;
  hideSearchSuggestions();
  applyFilters(true);
}

function syncDistanceFilterButtons() {
  document
    .querySelectorAll(".distance-filter-chip")
    .forEach(button => {
      button.classList.toggle(
        "active",
        selectedDistanceFilters.includes(
          button.dataset.distanceFilter
        )
      );
    });

  const distanceFilterCount =
    document.getElementById(
      "distanceFilterCount"
    );

  if (distanceFilterCount) {
    distanceFilterCount.textContent =
      selectedDistanceFilters.length
        ? getSearchTranslation(
            "search.selected",
            `${selectedDistanceFilters.length} selected`,
            { count: selectedDistanceFilters.length }
          )
        : getSearchTranslation(
            "filter.any",
            "Any"
          );
  }

}

function setFilterAccordionState(group, isOpen) {
  if (!group) {
    return;
  }

  group.classList.toggle(
    "open",
    Boolean(isOpen)
  );

  const toggle =
    group.querySelector(
      ".filter-accordion-toggle"
    );

  if (toggle) {
    toggle.setAttribute(
      "aria-expanded",
      String(Boolean(isOpen))
    );
  }
}

function initFilterAccordions() {
  document
    .querySelectorAll(".filter-accordion")
    .forEach(group => {
      const toggle =
        group.querySelector(
          ".filter-accordion-toggle"
        );

      if (!toggle) {
        return;
      }

      toggle.addEventListener(
        "click",
        () => {
          setFilterAccordionState(
            group,
            !group.classList.contains("open")
          );
        }
      );
    });
}

function normalizeDistanceSearchText(event) {
  return String(event.distance || "")
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, " ");
}

function normalizeDistanceContextText(event) {
  return `
    ${event.event_name || ""}
    ${event.sport || ""}
    ${event.distance || ""}
  `
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/\s+/g, " ");
}

function hasTriathlonSignal(text) {
  return /\btriathlon\b|\bironman\b|\btri\b/i.test(text);
}

function hasMiddleTriSignal(text) {
  return /\b70\.3\b|\bmiddle\b|\bmiddle distance\b|\bhalf ironman\b|\bmitteldistanz\b/i.test(text);
}

function distanceTextMatchesFilter(distanceText, contextText, filter) {
  switch (filter) {
    case "5k":
      return /(^|[^0-9])5\s?(k|km|kilometer)([^0-9]|$)/i.test(distanceText) ||
        /\b3\.1\s?miles?\b/i.test(distanceText);

    case "10k":
      return /(^|[^0-9])10\s?(k|km|kilometer)([^0-9]|$)/i.test(distanceText) ||
        /\b6\.2\s?miles?\b/i.test(distanceText);

    case "half":
      return /\bhalf marathon\b|\bhalbmarathon\b|\b21\s?(k|km|kilometer)\b|\b13\.1\s?miles?\b/i.test(distanceText);

    case "marathon":
      return /\b42\s?(k|km|kilometer)\b|\b26\.2\s?miles?\b/i.test(distanceText) ||
        /\bmarathon\b/i.test(
          distanceText.replace(
            /\bhalf marathon\b|\bhalbmarathon\b/g,
            ""
          )
        );

    case "ultra":
      return /\bultra\b|\bultramarathon\b|\btrail\b|backyard|\b\d{1,2}\s?h\b|\bmiles?\b|\b50\s?(k|km|kilometer)\b|\b60\s?(k|km|kilometer)\b|\b80\s?(k|km|kilometer)\b|\b100\s?(k|km|kilometer)\b|\b160\s?(k|km|kilometer)\b/i.test(contextText);

    case "tri-sprint":
      return /\bsprint\b/i.test(contextText) &&
        hasTriathlonSignal(contextText);

    case "tri-olympic":
      return /\bolympic\b|\bstandard distance\b|\bkurzdistanz\b/i.test(contextText) &&
        hasTriathlonSignal(contextText);

    case "tri-middle":
      return hasMiddleTriSignal(contextText) &&
        hasTriathlonSignal(contextText);

    case "tri-full":
      return !hasMiddleTriSignal(contextText) &&
        /\bfull\b|\bfull distance\b|\blong distance\b|\blangdistanz\b|\bironman\b/i.test(contextText) &&
        hasTriathlonSignal(contextText);

    default:
      return true;
  }
}

function eventMatchesDistanceFilters(event) {
  if (!selectedDistanceFilters.length) {
    return true;
  }

  const distanceText =
    normalizeDistanceSearchText(event);

  const contextText =
    normalizeDistanceContextText(event);

  return selectedDistanceFilters.some(filter =>
    distanceTextMatchesFilter(
      distanceText,
      contextText,
      filter
    )
  );
}

function parseGermanDate(dateStr) {
  if (!dateStr) return null;

  const [day, month, year] = dateStr.split(".");

  if (!day || !month || !year) {
    return null;
  }

  const parsedDate =
    new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== Number(year) ||
    parsedDate.getMonth() !== Number(month) - 1 ||
    parsedDate.getDate() !== Number(day)
  ) {
    return null;
  }

  parsedDate.setHours(0, 0, 0, 0);

  return parsedDate;
}


function parseInputDate(dateStr) {
  if (!dateStr) return null;

  const [year, month, day] = dateStr.split("-");

  if (!year || !month || !day) {
    return null;
  }

  const parsedDate =
    new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );

  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== Number(year) ||
    parsedDate.getMonth() !== Number(month) - 1 ||
    parsedDate.getDate() !== Number(day)
  ) {
    return null;
  }

  parsedDate.setHours(0, 0, 0, 0);

  return parsedDate;
}

function normalizeEventCountryCode(country) {
  const normalized = String(country || "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const aliases = {
    de: "DE",
    deutschland: "DE",
    germany: "DE",
    allemagne: "DE",
    at: "AT",
    osterreich: "AT",
    austria: "AT",
    autriche: "AT",
    ch: "CH",
    schweiz: "CH",
    switzerland: "CH",
    suisse: "CH",
    svizzera: "CH"
  };

  return aliases[normalized] || String(country || "").trim().toUpperCase();
}


function updateDateRangeState() {
  const dateRangeFilter =
    document.getElementById(
      "dateRangeFilter"
    );

  if (!dateRangeFilter) {
    return;
  }

  const dateFromValue =
    document.getElementById(
      "dateFromFilter"
    )?.value || "";

  const dateToValue =
    document.getElementById(
      "dateToFilter"
    )?.value || "";

  const dateFilterValue =
    document.getElementById(
      "dateFilter"
    )?.value || "all";

  dateRangeFilter.classList.toggle(
    "active",
    Boolean(
      dateFromValue ||
      dateToValue ||
      dateFilterValue === "custom"
    )
  );
}

function getActiveFilterLabels(resultCount = null) {
  const labels = [];

  const searchValue =
    document.getElementById("searchInput")?.value.trim() || "";

  const dateFilter =
    document.getElementById("dateFilter")?.value || "all";

  const dateFrom =
    document.getElementById("dateFromFilter")?.value || "";

  const dateTo =
    document.getElementById("dateToFilter")?.value || "";

  const sort =
    document.getElementById("sortSelect")?.value || "date";

  const country =
    document.getElementById("countryFilter")?.value || "all";

  if (resultCount !== null) {
    labels.push(`${resultCount} found`);
  }

  if (searchValue) {
    labels.push(`Search: ${searchValue}`);
  }

  if (country !== "all") {
    labels.push(
      document.querySelector(`#countryFilter option[value="${country}"]`)
        ?.textContent
        .trim() || country
    );
  }

  const sportFilters =
    getSelectedSportFilters();

  if (sportFilters.length) {
    labels.push(
      `Sports: ${sportFilters.join(", ")}`
    );
  }

  if (selectedDistanceFilters.length) {
    labels.push(
      `Distances: ${selectedDistanceFilters
        .map(filter =>
          DISTANCE_FILTER_LABELS[filter] || filter
        )
        .join(", ")}`
    );
  }

  if (dateFilter !== "all") {
    labels.push(
      document.querySelector(`#dateFilter option[value="${dateFilter}"]`)
        ?.textContent
        .trim() ||
      dateFilter
    );
  }

  if (dateFrom || dateTo) {
    labels.push(
      `${dateFrom || "Any"} - ${dateTo || "Any"}`
    );
  }

  if (sort !== "default") {
    labels.push(
      document.querySelector(`#sortSelect option[value="${sort}"]`)
        ?.textContent
        .trim() ||
      sort
    );
  }

  return labels;
}

function updateActiveFilterSummary(resultCount) {
  const summary =
    document.getElementById("activeFilterSummary");

  if (!summary) {
    return;
  }

  const labels =
    getActiveFilterLabels(resultCount);

  summary.innerHTML =
    labels
      .map(label => `<span>${label}</span>`)
      .join("");
}

function updateDiscoveryFilterCount() {
  const countBadge =
    document.getElementById("discoveryFilterCount");
  const panelToggle =
    document.getElementById("toggleSidebar");
  const dateFilter =
    document.getElementById("dateFilter")?.value || "all";
  const countryFilter =
    document.getElementById("countryFilter")?.value || "all";
  const hasCustomDate = Boolean(
    document.getElementById("dateFromFilter")?.value ||
    document.getElementById("dateToFilter")?.value
  );
  const activeCount =
    selectedSportFilters.length +
    selectedDistanceFilters.length +
    Number(countryFilter !== "all") +
    Number(dateFilter !== "all" || hasCustomDate);

  if (countBadge) {
    countBadge.textContent = String(activeCount);
    countBadge.hidden = activeCount === 0;
  }

  if (panelToggle) {
    panelToggle.dataset.activeFilterCount =
      String(activeCount);
  }

  if (typeof window.updateSidebarToggleState === "function") {
    window.updateSidebarToggleState();
  }
}

function resetAllFilters() {
  const searchInput =
    document.getElementById("searchInput");
  const sortSelect =
    document.getElementById("sortSelect");
  const dateFilter =
    document.getElementById("dateFilter");
  const countryFilter =
    document.getElementById("countryFilter");
  const dateFromFilter =
    document.getElementById("dateFromFilter");
  const dateToFilter =
    document.getElementById("dateToFilter");

  if (searchInput) searchInput.value = "";
  if (sortSelect) sortSelect.value = "date";
  if (dateFilter) dateFilter.value = "all";
  if (countryFilter) countryFilter.value = "all";
  if (dateFromFilter) dateFromFilter.value = "";
  if (dateToFilter) dateToFilter.value = "";

  selectedSportFilters = [];
  selectedDistanceFilters = [];
  currentFilter = "All";

  syncSportFilterButtons();
  syncDistanceFilterButtons();

  updateDateRangeState();
  applyFilters();
}

function initSearch() {

  initFilterAccordions();

  if (!searchLanguageListenerInitialized) {
    document.addEventListener(
      "app-language-changed",
      () => {
        syncDistanceFilterButtons();
        updateSearchSuggestions();
        applyFilters();
      }
    );

    searchLanguageListenerInitialized = true;
  }

  // SEARCH INPUT
  const searchInput =
    document.getElementById(
      "searchInput"
    );

  if (!searchInput) {
    return;
  }

  // LIVE FILTER
  searchInput.addEventListener(
    "input",
    () => {
      updateSearchSuggestions();
      trackSearchUsedDebounced();
      applyFilters();
    }
  );

  searchInput.addEventListener(
    "focus",
    updateSearchSuggestions
  );

  // ENTER SEARCH
  searchInput.addEventListener(
    "keydown",
    function(e) {

      if (e.key === "Enter") {

        hideSearchSuggestions();

        if (typeof trackEvent === "function") {
          trackEvent("search_performed", {
            query: searchInput.value.trim(),
            submitted: true,
            active_filters: getActiveFilterAnalytics(),
            page_context: "event_map"
          });
        }

        applyFilters(true);

      }

      if (e.key === "Escape") {
        hideSearchSuggestions();
      }

    }
  );

  const searchSuggestions =
    document.getElementById("searchSuggestions");

  if (searchSuggestions) {
    searchSuggestions.addEventListener(
      "mousedown",
      event => {
        const button =
          event.target.closest(
            "[data-search-suggestion]"
          );

        if (!button) {
          return;
        }

        event.preventDefault();

        applySearchSuggestion(
          button.dataset.searchSuggestion
        );
      }
    );
  }

  document.addEventListener(
    "click",
    event => {
      if (
        event.target.closest("#topbar-search")
      ) {
        return;
      }

      hideSearchSuggestions();
    }
  );

  // FILTER BUTTONS
  document
    .querySelectorAll(".filter-chip")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const filter =
            button.dataset.filter;

          if (filter === "All") {
            selectedSportFilters = [];
          }

          else if (
            selectedSportFilters.includes(filter)
          ) {
            selectedSportFilters =
              selectedSportFilters.filter(
                item => item !== filter
              );
          }

          else {
            selectedSportFilters.push(filter);
          }

          syncSportFilterButtons();

          trackFilterUsed(
            "sport",
            filter
          );

          applyFilters();

        }
      );

    });

  // DISTANCE FILTER BUTTONS
  document
    .querySelectorAll(".distance-filter-chip")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {
          const filter =
            button.dataset.distanceFilter;

          if (
            selectedDistanceFilters.includes(filter)
          ) {
            selectedDistanceFilters =
              selectedDistanceFilters.filter(
                item => item !== filter
              );
          } else {
            selectedDistanceFilters.push(filter);
          }

          syncDistanceFilterButtons();
          trackFilterUsed(
            "distance",
            filter
          );
          applyFilters();
        }
      );

    });

  // SORT
  document
    .getElementById("sortSelect")
    ?.addEventListener(
      "change",
      event => {
        trackFilterUsed(
          "sort",
          event.target.value
        );
        applyFilters();
      }
    );

  // COUNTRY FILTER
  document
    .getElementById("countryFilter")
    ?.addEventListener(
      "change",
      event => {
        trackFilterUsed(
          "country",
          event.target.value
        );
        applyFilters();
      }
    );

  // DATE FILTER
  document
    .getElementById("dateFilter")
    ?.addEventListener(
      "change",
      event => {
        updateDateRangeState();
        trackFilterUsed(
          "date",
          event.target.value
        );
        applyFilters();
      }
    );

  document
    .getElementById("dateFromFilter")
    ?.addEventListener(
      "change",
      () => {
        updateDateRangeState();
        trackFilterUsed(
          "date_from",
          "custom"
        );
        applyFilters();
      }
    );

  document
    .getElementById("dateToFilter")
    ?.addEventListener(
      "change",
      () => {
        updateDateRangeState();
        trackFilterUsed(
          "date_to",
          "custom"
        );
        applyFilters();
      }
    );

  document
    .getElementById("applyDateRangeFilter")
    ?.addEventListener(
      "click",
      () => {
        updateDateRangeState();
        trackFilterUsed(
          "date_range",
          "apply"
        );
        applyFilters(true);
      }
    );

  document
    .getElementById("clearDateRangeFilter")
    ?.addEventListener(
      "click",
      () => {
        const dateFrom =
          document.getElementById(
            "dateFromFilter"
          );

        const dateTo =
          document.getElementById(
            "dateToFilter"
          );

        if (dateFrom) dateFrom.value = "";
        if (dateTo) dateTo.value = "";

        updateDateRangeState();
        applyFilters();
      }
    );

  const resetFiltersBtn =
    document.getElementById("resetFiltersBtn");

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener(
      "click",
      resetAllFilters
    );
  }

  const mapStyleSelect =
    document.getElementById("mapStyleSelect");

  if (mapStyleSelect) {
    mapStyleSelect.value =
      localStorage.getItem("sportEventMap.mapStyle") ||
      "standard";

    mapStyleSelect.addEventListener(
      "change",
      event => {
        if (typeof setMapStyle === "function") {
          setMapStyle(event.target.value);
        }
      }
    );
  }

  const mapToolsToggle =
    document.getElementById("mapToolsToggle");

  const floatingActions =
    document.getElementById("floatingActions");

  if (mapToolsToggle && floatingActions) {
    mapToolsToggle.addEventListener(
      "click",
      () => {
        const isOpen =
          floatingActions.classList.toggle("open");

        mapToolsToggle.setAttribute(
          "aria-expanded",
          String(isOpen)
        );

        const actionLabel =
          isOpen
            ? "Kartenwerkzeuge schließen"
            : "Kartenwerkzeuge öffnen";

        mapToolsToggle.setAttribute(
          "aria-label",
          actionLabel
        );
        mapToolsToggle.title = actionLabel;
      }
    );
  }

  const mapStyleBtn =
    document.getElementById("mapStyleBtn");

  if (mapStyleBtn && mapStyleSelect) {
    const styleOrder =
      ["standard", "light", "outdoor"];

    const updateMapStyleButtonTitle = () => {
      const currentOption =
        mapStyleSelect.options[
          mapStyleSelect.selectedIndex
        ];

      mapStyleBtn.title =
        `Map style: ${currentOption.textContent.trim()}`;

      mapStyleBtn.setAttribute(
        "aria-label",
        mapStyleBtn.title
      );
    };

    updateMapStyleButtonTitle();

    mapStyleBtn.addEventListener(
      "click",
      () => {
        const currentIndex =
          styleOrder.indexOf(mapStyleSelect.value);

        const nextStyle =
          styleOrder[
            (currentIndex + 1) % styleOrder.length
          ];

        mapStyleSelect.value =
          nextStyle;

        if (typeof setMapStyle === "function") {
          setMapStyle(nextStyle);
        }

        updateMapStyleButtonTitle();
      }
    );
  }

  const mobileFilterBtn =
    document.getElementById("mobileFilterBtn");

  const mobileFilterBackdrop =
    document.getElementById("mobileFilterBackdrop");

  const closeMobileFilters = () => {
    document.body.classList.remove(
      "mobile-filter-open"
    );

    if (typeof window.setSidebarExpanded === "function") {
      window.setSidebarExpanded(false);
    } else {
      document.getElementById("sidebar")?.classList.add("closed");
    }
  };

  if (mobileFilterBtn) {
    mobileFilterBtn.addEventListener(
      "click",
      () => {
        if (typeof window.setSidebarExpanded === "function") {
          window.setSidebarExpanded(true);
        } else {
          document.getElementById("sidebar")?.classList.remove("closed");
        }

        document.body.classList.add(
          "mobile-filter-open"
        );
      }
    );
  }

  if (mobileFilterBackdrop) {
    mobileFilterBackdrop.addEventListener(
      "click",
      closeMobileFilters
    );
  }

  const mobileFilterShell =
    document.getElementById("sidebar");

  if (mobileFilterShell) {
    mobileFilterShell.addEventListener(
      "click",
      event => {
        if (
          !document.body.classList.contains("mobile-filter-open") ||
          event.target.closest("#sidebar-header")
        ) {
          return;
        }

        closeMobileFilters();
      }
    );
  }

}


function applyFilters(zoom = false) {
  if (
    typeof allMarkers === "undefined" ||
    !Array.isArray(allMarkers)
  ) {
    return;
  }

  const searchInput =
    document.getElementById(
      "searchInput"
    );

  if (!searchInput) {
    return;
  }

  const searchQuery =
    searchInput.value;

  const smartSearch =
    parseSmartSearch(searchQuery);

  // SEARCH + SPORT FILTER
  let filtered =
    allMarkers.filter(item => {

      const event = item.data;

      const matchesSearch =
        eventMatchesSmartSearch(
          event,
          smartSearch
        );

      const sportFilters =
        getSelectedSportFilters();

      const matchesFilter =
        sportFilters.length === 0 ||
        sportFilters.includes(event.sport);

      const matchesDistance =
        eventMatchesDistanceFilters(event);

      return (
        matchesSearch &&
        matchesFilter &&
        matchesDistance
      );

    });


  // COUNTRY FILTER
  const countryFilter =
    document.getElementById("countryFilter")?.value || "all";

  if (countryFilter !== "all") {
    filtered = filtered.filter(item =>
      normalizeEventCountryCode(item.data.country) === countryFilter
    );
  }

  // DATE FILTER
  const dateFilter =
    document.getElementById(
      "dateFilter"
    )?.value || "all";

if (dateFilter === "upcoming") {

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  filtered = filtered.filter(item => {

    const eventDate = parseGermanDate(item.data.date);

    if (!eventDate) return false;

    eventDate.setHours(0, 0, 0, 0);

    return eventDate >= now;
  });

}

  if (dateFilter === "thisYear") {

    const now = new Date();

    filtered = filtered.filter(item => {

      const eventDate = parseGermanDate(item.data.date);

      if (!eventDate) return false;

      return eventDate.getFullYear() === now.getFullYear();

    });

  }

  if (dateFilter === "next30") {

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + 30);

    filtered = filtered.filter(item => {

      const eventDate = parseGermanDate(item.data.date);

      if (!eventDate) return false;

      eventDate.setHours(0, 0, 0, 0);

      return eventDate >= now && eventDate <= maxDate;

    });

  }

  const dateFrom =
    parseInputDate(
      document.getElementById(
        "dateFromFilter"
      )?.value || ""
    );

  const dateTo =
    parseInputDate(
      document.getElementById(
        "dateToFilter"
      )?.value || ""
    );

  const hasCustomRange =
    dateFrom ||
    dateTo;

  if (hasCustomRange) {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      filtered = [];

      if (
        !invalidRangeNotified &&
        typeof showAppMessage === "function"
      ) {
        showAppMessage(
          "Invalid date range",
          "The start date must be before the end date."
        );
      }

      invalidRangeNotified = true;
    }

    else {
      invalidRangeNotified = false;
      filtered = filtered.filter(item => {

        const eventDate =
          parseGermanDate(item.data.date);

        if (!eventDate) return false;

        eventDate.setHours(0, 0, 0, 0);

        if (dateFrom && eventDate < dateFrom) {
          return false;
        }

        if (dateTo && eventDate > dateTo) {
          return false;
        }

        return true;

      });
    }

  }
  else {
    invalidRangeNotified = false;
  }


  // SORT
 const sort = document.getElementById("sortSelect")?.value || "date";

if (sort === "name") {
  filtered.sort((a, b) =>
    (a.data.event_name || "").localeCompare(b.data.event_name || "")
  );
}

if (sort === "date") {
  filtered.sort((a, b) => {
    const dateA =
      parseGermanDate(a.data.date) ||
      new Date(8640000000000000);

    const dateB =
      parseGermanDate(b.data.date) ||
      new Date(8640000000000000);

    return dateA - dateB;
  });
}


  // RESET MARKERS
  // ADD FILTERED MARKERS
  if (typeof setVisibleMapMarkers === "function") {
    setVisibleMapMarkers(filtered);
  }
  else {
    if (
      typeof markerLayer === "undefined" ||
      !markerLayer
    ) {
      return;
    }

    markerLayer.clearLayers();

    filtered.forEach(item => {

      markerLayer.addLayer(
        item.marker
      );

    });
  }


  // UPDATE LIST
  updateActiveFilterSummary(filtered.length);
  updateDiscoveryFilterCount();

  if (typeof renderEventList === "function") {
    renderEventList(
      filtered.map(
        item => item.data
      )
    );
  }


  // AUTO ZOOM
  if (zoom && filtered.length > 0) {

    // SINGLE EVENT
    if (filtered.length === 1) {

      if (typeof map === "undefined" || !map) {
        return;
      }

      map.flyTo(
        filtered[0].marker.getLatLng(),
        12,
        {
          duration: 1
        }
      );

      return;

    }

    // MULTIPLE EVENTS
    const bounds =
      L.latLngBounds(

        filtered.map(item =>

          item.marker.getLatLng()

        )

      );

    if (typeof map === "undefined" || !map) {
      return;
    }

    map.flyToBounds(bounds, {

      padding: [80, 80],

      duration: 1

    });

  }

}
