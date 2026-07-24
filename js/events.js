let events = [];

let favorites =
  JSON.parse(
    localStorage.getItem("favorites")
  ) || [];

let csvEventsPromise = null;
let seasonTimeInputSaveTimer = null;
const seasonOpenDetailPanels =
  new Set();

let lastTrackedEventOpen = {
  key: "",
  at: 0
};

document.addEventListener(
  "click",
  event => {
    const websiteLink =
      event.target.closest("[data-popup-website]");

    if (websiteLink) {
      if (typeof trackEvent === "function") {
        trackEvent("external_event_website_clicked", {
          event_id:
            websiteLink.dataset.popupWebsite,
          source: "map_popup"
        });
      }

      return;
    }

    const drawerButton =
      event.target.closest("[data-popup-drawer]");

    if (!drawerButton) return;

    event.preventDefault();

    const eventKey =
      drawerButton.dataset.popupDrawer;

    const selectedEvent =
      events.find(item =>
        getEventKey(item) === eventKey
      );

    if (selectedEvent) {
      openDrawer(selectedEvent);
    }
  }
);

function cleanValue(value) {
  return String(value || "").trim();
}


function createEventKey(event) {
  return [
    event.event_name,
    event.date,
    event.city,
    event.country
  ]
    .map(cleanValue)
    .join("|")
    .toLowerCase();
}


function createLegacyEventKey(event) {
  return [
    event.event_name,
    event.date,
    event.city
  ]
    .map(cleanValue)
    .join("|")
    .toLowerCase();
}


function createLegacyAdminEventKey(event) {
  const normalizedName =
    cleanValue(event.event_name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(
        /\b(generali|bmw|datev|mainova|tcs|nn|adac|sparkasse)\b/g,
        " "
      )
      .replace(
        /\b(5k|10k|half|halbmarathon|marathon|kilometer|km)\b/g,
        " "
      )
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return [
    normalizedName,
    cleanValue(event.date),
    cleanValue(event.city).toLowerCase(),
    cleanValue(event.country).toLowerCase()
  ].join("|");
}


function getEventKeyAliases(event) {
  return [
    getEventKey(event),
    createLegacyEventKey(event),
    createLegacyAdminEventKey(event),
    event.event_name
  ].filter((alias, index, aliases) =>
    alias && aliases.indexOf(alias) === index
  );
}


function parseCoordinate(value) {
  const cleaned =
    cleanValue(value)
      .replace(",", ".");

  const parts =
    cleaned.split(".");

  if (parts.length > 2) {
    return Number(
      `${parts[0]}.${parts.slice(1).join("")}`
    );
  }

  return Number(cleaned);
}


function normalizeEvent(rawEvent) {
  const normalized = {
    ...rawEvent,
    event_name:
      cleanValue(rawEvent.event_name || rawEvent.name),
    sport:
      cleanValue(rawEvent.sport),
    date:
      cleanValue(rawEvent.date),
    city:
      cleanValue(rawEvent.city),
    country:
      cleanValue(rawEvent.country),
    distance:
      cleanValue(rawEvent.distance),
    description:
      cleanValue(rawEvent.description),
    image:
      cleanValue(rawEvent.image || rawEvent["image "]),
    event_url:
      cleanValue(rawEvent.event_url || rawEvent.url),
    source_url:
      cleanValue(rawEvent.source_url || rawEvent.event_url || rawEvent.url),
    verification_status:
      cleanValue(
        rawEvent.verification_status ||
        rawEvent.registration_status ||
        rawEvent.event_status
      ),
    priority:
      cleanValue(rawEvent.priority),
    check_frequency:
      cleanValue(rawEvent.check_frequency),
    last_checked:
      cleanValue(rawEvent.last_checked),
    next_check:
      cleanValue(rawEvent.next_check),
    source_note:
      cleanValue(
        rawEvent.source_note ||
        rawEvent.status_note ||
        rawEvent.data_source
      ),
    latitude:
      parseCoordinate(rawEvent.latitude),
    longitude:
      parseCoordinate(rawEvent.longitude)
  };

  normalized.event_key =
    createEventKey(normalized);

  return normalized;
}


function normalizeEvents(rawEvents) {
  const normalizedEvents =
    rawEvents
    .filter(event =>
      event &&
      cleanValue(event.event_name || event.name)
    )
    .map(normalizeEvent);

  const uniqueEvents =
    new Map();

  normalizedEvents.forEach(event => {
    if (!uniqueEvents.has(event.event_key)) {
      uniqueEvents.set(
        event.event_key,
        event
      );
    }
  });

  return Array.from(
    uniqueEvents.values()
  );
}


function getEventKey(event) {
  return event.event_key || createEventKey(event);
}


function isFavorite(event) {
  const aliases =
    getEventKeyAliases(event);

  return aliases.some(alias =>
    favorites.includes(alias)
  );
}


function saveFavorites() {
  localStorage.setItem(
    "favorites",
    JSON.stringify(favorites)
  );
}


function migrateLocalPlanningKeys(eventList) {
  const storedMeta =
    getSeasonPlanMeta();
  const migratedFavorites =
    new Set();
  let favoritesChanged = false;
  let metaChanged = false;

  eventList.forEach(event => {
    const canonicalKey =
      getEventKey(event);
    const aliases =
      getEventKeyAliases(event);

    if (aliases.some(alias => favorites.includes(alias))) {
      migratedFavorites.add(canonicalKey);

      if (!favorites.includes(canonicalKey)) {
        favoritesChanged = true;
      }
    }

    const legacyMetaKey = aliases.find(alias =>
      alias !== canonicalKey && storedMeta[alias]
    );

    if (legacyMetaKey) {
      storedMeta[canonicalKey] = {
        ...storedMeta[legacyMetaKey],
        ...(storedMeta[canonicalKey] || {})
      };
      delete storedMeta[legacyMetaKey];
      metaChanged = true;
    }
  });

  favorites.forEach(favorite => {
    const matched = eventList.some(event =>
      getEventKeyAliases(event).includes(favorite)
    );

    if (!matched) {
      migratedFavorites.add(favorite);
    }
  });

  if (
    favoritesChanged ||
    migratedFavorites.size !== favorites.length
  ) {
    favorites = [...migratedFavorites];
    saveFavorites();
  }

  if (metaChanged) {
    saveSeasonPlanMeta(storedMeta);
  }
}

function applyRemotePlanningState(state = {}) {
  const localMeta =
    getSeasonPlanMeta();
  const remoteMeta =
    state.seasonMeta || {};
  const mergedMeta =
    {
      ...localMeta
    };

  Object.entries(remoteMeta).forEach(([eventKey, remoteEntry]) => {
    const localEntry =
      normalizeSeasonMetaEntry(
        localMeta[eventKey] || {}
      );
    const normalizedRemote =
      normalizeSeasonMetaEntry(
        remoteEntry || {}
      );

    mergedMeta[eventKey] =
      normalizeSeasonMetaEntry({
        ...localEntry,
        ...normalizedRemote,
        note:
          normalizedRemote.note ||
          localEntry.note ||
          "",
        planner_details:
          normalizePlannerDetails(
            {
              ...localEntry.planner_details,
              ...normalizedRemote.planner_details,
              goals: {
                ...localEntry.planner_details.goals,
                ...normalizedRemote.planner_details.goals
              },
              logistics: {
                ...localEntry.planner_details.logistics,
                ...normalizedRemote.planner_details.logistics
              },
              equipment: {
                ...localEntry.planner_details.equipment,
                ...normalizedRemote.planner_details.equipment,
                checked: {
                  ...localEntry.planner_details.equipment?.checked,
                  ...normalizedRemote.planner_details.equipment?.checked
                },
                items: [
                  ...new Set([
                    ...(localEntry.planner_details.equipment?.items || []),
                    ...(normalizedRemote.planner_details.equipment?.items || [])
                  ])
                ]
              },
              nutrition: {
                ...localEntry.planner_details.nutrition,
                ...normalizedRemote.planner_details.nutrition,
                entries: [
                  ...(localEntry.planner_details.nutrition?.entries || []),
                  ...(normalizedRemote.planner_details.nutrition?.entries || [])
                ]
              },
              post_race: {
                ...localEntry.planner_details.post_race,
                ...normalizedRemote.planner_details.post_race
              },
              result: {
                ...localEntry.planner_details.result,
                ...normalizedRemote.planner_details.result
              }
            },
            normalizedRemote.note ||
            localEntry.note ||
            ""
          )
      });
    });

  favorites =
    Array.isArray(state.favorites)
      ? [...new Set(state.favorites)]
      : [];

  saveFavorites();

  localStorage.setItem(
    "seasonPlanMeta",
    JSON.stringify(
      mergedMeta
    )
  );

  if (
    typeof renderEventList === "function" &&
    Array.isArray(events) &&
    events.length
  ) {
    if (typeof applyFilters === "function") {
      applyFilters();
    } else {
      renderEventList(events);
    }
  }

  const planner =
    document.getElementById("seasonPlannerModal");

  if (
    planner?.classList.contains("open") &&
    typeof renderSeasonPlanner === "function"
  ) {
    renderSeasonPlanner();
  }
}

window.applyRemotePlanningState =
  applyRemotePlanningState;

if (window.__pendingPlanningState) {
  applyRemotePlanningState(
    window.__pendingPlanningState
  );
  delete window.__pendingPlanningState;
}


function escapeHTML(value) {
  return cleanValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function safeUrl(value) {
  try {
    const url =
      new URL(cleanValue(value));

    if (
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) {
      return url.href;
    }
  } catch (_error) {
    // Invalid URLs are intentionally replaced with a non-navigating link.
  }

  return "#";
}


const INDEXED_EVENT_DETAIL_SLUGS = new Set([
  "bmw-berlin-marathon-2026",
  "generali-koln-marathon-2026",
  "haspa-marathon-hamburg-2027",
  "mainova-frankfurt-marathon-2026",
  "marathon-munchen-by-brooks-2026",
  "adac-marathon-hannover-2027",
  "uniper-marathon-dusseldorf-2027",
  "vienna-city-marathon-2027",
  "valencia-marathon-trinidad-alfonso-zurich-2026",
  "tcs-amsterdam-marathon-2026",
  "adidas-stockholm-marathon-2027",
  "edp-lisbon-marathon-2026",
  "valencia-half-marathon-trinidad-alfonso-zurich-2026",
  "generali-berlin-half-marathon-2027",
  "london-marathon-2027",
  "nn-marathon-rotterdam-2026",
  "schneider-electric-marathon-de-paris-2026",
  "vodafone-prague-marathon-2026",
  "barcelona-marathon-2027",
  "rome-marathon-2027",
  "madrid-marathon-2027",
  "dublin-marathon-2026",
  "hermannslauf-bielefeld-2026",
  "zugspitz-ultratrail-2026",
  "hoka-utmb-mont-blanc-2026",
  "mozart-100-by-utmb-2027",
  "transvulcania-2027",
  "100-meilen-berlin-mauerweglauf-2026",
  "challenge-roth-2026",
  "ironman-hamburg-european-championship-2026",
  "ironman-frankfurt-2026",
  "ironman-70-3-duisburg-2026",
  "ironman-70-3-leipzig-2026",
  "ironman-70-3-erkner-2026",
  "ironman-kaernten-klagenfurt-austria-2026",
  "ironman-copenhagen-2026",
  "ironman-switzerland-thun-2026",
  "challenge-almere-amsterdam-2026",
  "challenge-peguera-mallorca-2026",
  "challenge-kaiserwinkl-walchsee-2026",
  "bielefelder-triathlon-2026",
  "koln-triathlon-2026",
  "suzuki-world-triathlon-hamburg-2026-2026",
  "frankfurt-city-triathlon-2026",
  "o-see-challenge-dm-cross-triathlon-xterra-2026",
  "barmer-currex-alsterlauf-hamburg-2026",
  "hella-hamburg-halbmarathon-2026",
  "haspa-halbmarathon-hamburg-2027",
  "kolner-halbmarathon-2026",
  "sportscheck-run-munchen-2026"
]);


function slugifyEventPart(value) {
  return cleanValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}


function getEventYear(event) {
  const date =
    cleanValue(event.date);

  const germanMatch =
    date.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);

  const isoMatch =
    date.match(/\b(\d{4})-\d{2}-\d{2}\b/);

  if (germanMatch) {
    return germanMatch[3];
  }

  if (isoMatch) {
    return isoMatch[1];
  }

  return "";
}


function getEventDetailSlug(event) {
  return slugifyEventPart(
    [
      event.event_name,
      getEventYear(event)
    ]
      .filter(Boolean)
      .join(" ")
  );
}


function getEventDetailUrl(event) {
  const slug =
    getEventDetailSlug(event);

  return slug
    ? `event/${slug}/`
    : "";
}

function getPendingSeasonAdd() {
  try {
    const raw =
      localStorage.getItem("pendingSeasonAdd");

    return raw
      ? JSON.parse(raw)
      : null;
  } catch (error) {
    console.warn(
      "Could not read pending season event.",
      error
    );
    return null;
  }
}

function clearPendingSeasonAdd() {
  try {
    localStorage.removeItem("pendingSeasonAdd");
  } catch (_error) {
    // Local storage can fail in private browsing modes.
  }
}

async function processPendingSeasonAdd() {
  const pending =
    getPendingSeasonAdd();

  if (
    !pending ||
    !Array.isArray(events) ||
    !events.length
  ) {
    return;
  }

  const pendingKey =
    cleanValue(pending.event_key);
  const pendingSlug =
    cleanValue(pending.event_slug);

  const found =
    events.find(event =>
      getEventKey(event) === pendingKey ||
      getEventDetailSlug(event) === pendingSlug
    );

  if (!found) {
    clearPendingSeasonAdd();

    if (typeof showToast === "function") {
      showToast(
        "Event not found",
        "The event could not be added to your Season Planner."
      );
    }
    return;
  }

  const added =
    await addEventToSeasonPlanner(found, {
      source: "pending_detail"
    });

  if (added) {
    clearPendingSeasonAdd();
  }
}

window.processPendingSeasonAdd =
  processPendingSeasonAdd;

async function addEventToSeasonPlanner(event, options = {}) {
  let isSignedIn = false;

  try {
    if (typeof canOpenSeasonPlanner === "function") {
      isSignedIn =
        await canOpenSeasonPlanner();
    }
  } catch (error) {
    console.warn(
      "Season Planner auth check failed",
      error
    );
  }

  if (!isSignedIn) {
    if (typeof showAppMessage === "function") {
      showAppMessage(
        "Login required",
        "Bitte logge dich ein, um dieses Event in deinem Season Planner zu speichern."
      );
    }

    if (typeof openAuthModal === "function") {
      openAuthModal("login");
    }

    return false;
  }

  if (isFavorite(event)) {
    if (typeof showToast === "function") {
      showToast(
        "Already in Season Planner",
        "Dieses Event ist bereits in deiner Saison gespeichert."
      );
    }

    updateFavoriteButtons(event);
    return true;
  }

  toggleFavorite(event);

  if (typeof showToast === "function") {
    showToast(
      "Added to Season Planner",
      `${cleanValue(event.event_name) || "This event"} wurde deiner Saison hinzugefügt.`
    );
  }

  if (
    typeof trackEvent === "function"
  ) {
    trackEvent("season_detail_add_confirmed", {
      event_id:
        typeof getEventKey === "function"
          ? getEventKey(event)
          : "",
      source: options.source || "event_detail"
    });
  }

  return true;
}

window.addEventToSeasonPlanner =
  addEventToSeasonPlanner;


function safeImageUrl(value) {
  const url =
    safeUrl(value);

  const lowerUrl =
    url.toLowerCase();

  if (
    url === "#" ||
    lowerUrl === "image" ||
    lowerUrl.endsWith(" image") ||
    lowerUrl.includes("/logos/") ||
    lowerUrl.includes("placeholder")
  ) {
    return "";
  }

  return url;
}


function getEventSpecificImageUrl(event) {
  const name =
    cleanValue(event.event_name)
      .toLowerCase();

  const eventImages = [
    {
      match: ["berlin", "marathon"],
      url:
        "https://images.unsplash.com/photo-1560073744-7643b964bdf8?q=80&w=1600&auto=format&fit=crop&crop=entropy"
    },
    {
      match: ["hamburg", "marathon"],
      url:
        "https://images.unsplash.com/photo-1502224562085-639556652f33?q=80&w=1600&auto=format&fit=crop&crop=entropy"
    },
    {
      match: ["ironman"],
      url:
        "https://images.unsplash.com/photo-1530549387789-4c1017266635?q=80&w=1600&auto=format&fit=crop&crop=entropy"
    },
    {
      match: ["triathlon"],
      url:
        "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=1600&auto=format&fit=crop&crop=entropy"
    }
  ];

  const found =
    eventImages.find(item =>
      item.match.every(word =>
        name.includes(word)
      )
    );

  return found ? found.url : "";
}


function getCleanEventDescription(event) {
  const description =
    cleanValue(event.description);

  const lowerDescription =
    description.toLowerCase();

  const isImportNote =
    !description ||
    lowerDescription.includes("imported from") ||
    lowerDescription.includes("source listing") ||
    lowerDescription.includes("marathon.de");

  const name =
    cleanValue(event.event_name);

  const city =
    cleanValue(event.city);

  const sport =
    cleanValue(event.sport);

  const lowerName =
    name.toLowerCase();

  if (lowerName.includes("berlin marathon")) {
    return "A fast World Marathon Major through Berlin. The official course is known for very little elevation gain and passes many of the city sights.";
  }

  if (lowerName.includes("köln marathon") || lowerName.includes("koln marathon")) {
    return "Generali Cologne Marathon is a city road race with a flat and fast marathon course and a strong party atmosphere along the route.";
  }

  if (lowerName.includes("ironman hamburg")) {
    return "IRONMAN Hamburg combines an Alster swim, a bike course through Hamburg and the surrounding region, and a marathon run finishing in the city center.";
  }

  if (lowerName.includes("köln triathlon") || lowerName.includes("koln triathlon")) {
    return "Cologne Triathlon offers multiple race formats around the Rheinpark area, including sprint, Olympic and middle-distance triathlon racing.";
  }

  if (!isImportNote) {
    return description;
  }

  if (sport === "Triathlon") {
    return `${name} is a triathlon event in ${city} with swim, bike and run racing. Check the official event page for course details and registration.`;
  }

  if (sport === "Ultramarathon") {
    return `${name} is an ultramarathon or trail-style endurance event in ${city}. Check the official event page for terrain, elevation and aid station details.`;
  }

  return `${name} is a running event in ${city}. Check the official event page for course profile, start area and registration details.`;
}


function parseEventStatDescription(description) {
  const stats = {};

  cleanValue(description)
    .split(/\n|;/)
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => {
      const separatorIndex =
        line.indexOf(":");

      if (separatorIndex === -1) {
        return;
      }

      const key =
        line
          .slice(0, separatorIndex)
          .trim()
          .toLowerCase();

      const value =
        line
          .slice(separatorIndex + 1)
          .trim();

      if (!value) {
        return;
      }

      if (key.includes("participant")) {
        stats.participants = value;
      }

      if (key.includes("course")) {
        stats.course = value;
      }

      if (key.includes("highlight") || key.includes("info")) {
        stats.highlight = value;
      }
    });

  return stats;
}


function getEventStats(event) {
  const parsedStats =
    parseEventStatDescription(event.description);

  const name =
    cleanValue(event.event_name)
      .toLowerCase();

  const knownStats = [
    {
      match: ["berlin", "marathon"],
      stats: {
        participants:
          "Around 60,000 athletes",
        course:
          "Flat course with very little elevation gain",
        highlight:
          "World Marathon Major through Berlin, finishing near Brandenburg Gate"
      }
    },
    {
      match: ["köln", "marathon"],
      stats: {
        participants:
          "37,000+ participants across the race weekend",
        course:
          "Flat and fast city course",
        highlight:
          "Cologne city race with a strong party atmosphere along the route"
      }
    },
    {
      match: ["koln", "marathon"],
      stats: {
        participants:
          "37,000+ participants across the race weekend",
        course:
          "Flat and fast city course",
        highlight:
          "Cologne city race with a strong party atmosphere along the route"
      }
    },
    {
      match: ["ironman", "hamburg"],
      stats: {
        course:
          "Alster swim, city bike course and marathon run around the Alster",
        highlight:
          "Full-distance IRONMAN race finishing in central Hamburg"
      }
    },
    {
      match: ["köln", "triathlon"],
      stats: {
        course:
          "Rhine/Rheinpark race area with swim, bike and run formats",
        highlight:
          "Sprint, Olympic and middle-distance racing in Cologne"
      }
    },
    {
      match: ["koln", "triathlon"],
      stats: {
        course:
          "Rhine/Rheinpark race area with swim, bike and run formats",
        highlight:
          "Sprint, Olympic and middle-distance racing in Cologne"
      }
    },
    {
      match: ["hamburg", "marathon"],
      stats: {
        highlight:
          "Germany's largest spring marathon"
      }
    },
    {
      match: ["münchen", "marathon"],
      stats: {
        course:
          "One-lap course through Munich",
        highlight:
          "World Athletics Road Race Label event"
      }
    },
    {
      match: ["munich", "marathon"],
      stats: {
        course:
          "One-lap course through Munich",
        highlight:
          "World Athletics Road Race Label event"
      }
    },
    {
      match: ["frankfurt", "marathon"],
      stats: {
        course:
          "Flat circular road course along both sides of the River Main",
        highlight:
          "Fast city marathon in Germany's financial capital"
      }
    }
  ];

  const known =
    knownStats.find(item =>
      item.match.every(word =>
        name.includes(word)
      )
    );

  return {
    ...(known ? known.stats : {}),
    ...parsedStats
  };
}


function createEventStatsMarkup(event) {
  const stats =
    getEventStats(event);

  const rows = [
    stats.participants
      ? {
          icon: "👥",
          label: "Participants",
          value: stats.participants
        }
      : null,
    stats.course
      ? {
          icon: "↗",
          label: "Course",
          value: stats.course
        }
      : null,
    stats.highlight
      ? {
          icon: "✨",
          label: "Highlight",
          value: stats.highlight
        }
      : null
  ].filter(Boolean);

  if (!rows.length) {
    return `
      <div class="event-stats-empty">
        More event details will be added soon.
      </div>
    `;
  }

  return rows
    .map(row => `
      <div class="event-stat-row">
        <span class="event-stat-icon">${row.icon}</span>
        <div>
          <strong>${escapeHTML(row.label)}</strong>
          <p>${escapeHTML(row.value)}</p>
        </div>
      </div>
    `)
    .join("");
}

let currentRenderedEvents = [];
let eventListPage = 1;
const EVENT_LIST_PAGE_SIZE = 48;
const EVENT_CARD_DENSITY_STORAGE_KEY =
  "sportEventMap.eventCardDensity";
let eventCardDensity =
  localStorage.getItem(EVENT_CARD_DENSITY_STORAGE_KEY) === "detailed"
    ? "detailed"
    : "compact";


function isEventListFullscreen() {
  return document.body.classList.contains(
    "event-list-fullscreen"
  );
}


function getEventListPageCount(events) {
  if (!isEventListFullscreen()) {
    return 1;
  }

  return Math.max(
    1,
    Math.ceil(events.length / EVENT_LIST_PAGE_SIZE)
  );
}

function syncEventCardDensityState() {
  document.body.classList.toggle(
    "event-card-detail-mode",
    isEventListFullscreen() &&
      eventCardDensity === "detailed"
  );

  const densityButton =
    document.getElementById("toggleEventCardDensity");

  if (!densityButton) {
    return;
  }

  densityButton.textContent =
    eventCardDensity === "detailed"
      ? "Compact cards"
      : "Detailed cards";

  densityButton.setAttribute(
    "aria-pressed",
    String(eventCardDensity === "detailed")
  );
}


function getVisibleEventListPage(events) {
  const pageCount =
    getEventListPageCount(events);

  eventListPage =
    Math.min(
      Math.max(eventListPage, 1),
      pageCount
    );

  if (!isEventListFullscreen()) {
    return events;
  }

  const start =
    (eventListPage - 1) * EVENT_LIST_PAGE_SIZE;

  return events.slice(
    start,
    start + EVENT_LIST_PAGE_SIZE
  );
}


function updateEventListControls(events) {
  const summary =
    document.getElementById("eventListSummary");

  const pagination =
    document.getElementById("eventListPagination");

  const fullscreenButton =
    document.getElementById("toggleEventListFullscreen");

  if (summary) {
    summary.textContent =
      `${events.length} Events`;
  }

  if (fullscreenButton) {
    fullscreenButton.textContent =
      isEventListFullscreen()
        ? "← Map"
        : "→ List";

    fullscreenButton.setAttribute(
      "aria-label",
      isEventListFullscreen()
        ? "Collapse list and show map"
        : "Expand event list"
    );

    fullscreenButton.title =
      isEventListFullscreen()
        ? "Collapse list and show map"
        : "Expand event list";
  }

  syncEventCardDensityState();

  if (!pagination) {
    return;
  }

  pagination.innerHTML = "";

  if (!isEventListFullscreen()) {
    return;
  }

  const pageCount =
    getEventListPageCount(events);

  const info =
    document.createElement("span");

  info.className =
    "event-list-page-info";

  info.textContent =
    `Page ${eventListPage} of ${pageCount}`;

  const previous =
    document.createElement("button");

  previous.type = "button";
  previous.textContent = "Previous";
  previous.disabled = eventListPage <= 1;
  previous.onclick = () => {
    eventListPage -= 1;
    renderEventList(currentRenderedEvents, {
      preservePage: true
    });
  };

  const next =
    document.createElement("button");

  next.type = "button";
  next.textContent = "Next";
  next.disabled = eventListPage >= pageCount;
  next.onclick = () => {
    eventListPage += 1;
    renderEventList(currentRenderedEvents, {
      preservePage: true
    });
  };

  pagination.append(
    previous,
    info,
    next
  );
}


function initEventListFullscreenControls() {
  const button =
    document.getElementById("toggleEventListFullscreen");

  const densityButton =
    document.getElementById("toggleEventCardDensity");

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    document.body.classList.toggle(
      "event-list-fullscreen"
    );

    if (
      !document.body.classList.contains(
        "event-list-fullscreen"
      )
    ) {
      document.body.classList.remove(
        "fullscreen-drawer-open"
      );
    }

    syncEventCardDensityState();

    eventListPage = 1;

    if (typeof updateDateRangeState === "function") {
      updateDateRangeState();
    }

    renderEventList(currentRenderedEvents, {
      preservePage: true
    });

    if (typeof refreshMapLayout === "function") {
      refreshMapLayout(350);
    }
  });

  if (densityButton) {
    densityButton.addEventListener("click", () => {
      eventCardDensity =
        eventCardDensity === "detailed"
          ? "compact"
          : "detailed";

      localStorage.setItem(
        EVENT_CARD_DENSITY_STORAGE_KEY,
        eventCardDensity
      );

      syncEventCardDensityState();

      renderEventList(currentRenderedEvents, {
        preservePage: true
      });
    });
  }
}


function getSportImageUrl(event) {
  const sport =
    cleanValue(event.sport)
      .toLowerCase();

  const nameAndDistance =
    `${event.event_name || ""} ${event.distance || ""}`
      .toLowerCase();

  if (
    sport.includes("triathlon") ||
    nameAndDistance.includes("triathlon") ||
    nameAndDistance.includes("ironman")
  ) {
    return "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=1600&auto=format&fit=crop";
  }

  if (
    sport.includes("ultra") ||
    nameAndDistance.includes("ultra") ||
    nameAndDistance.includes("trail")
  ) {
    return "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1600&auto=format&fit=crop";
  }

  const images = {
    running:
      "https://images.unsplash.com/photo-1502224562085-639556652f33?q=80&w=1600&auto=format&fit=crop",
    triathlon:
      "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?q=80&w=1600&auto=format&fit=crop",
    ultramarathon:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1600&auto=format&fit=crop",
    ultra:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1600&auto=format&fit=crop"
  };

  return (
    images[sport] ||
    images.running
  );
}

function getSportIconMarkup(event) {
  const sport =
    cleanValue(event.sport)
      .toLowerCase();

  const nameAndDistance =
    `${event.event_name || ""} ${event.distance || ""}`
      .toLowerCase();

  if (
    sport.includes("triathlon") ||
    nameAndDistance.includes("triathlon") ||
    nameAndDistance.includes("ironman")
  ) {
    return "&#127946;";
  }

  return "&#127939;";
}

function getEventFormatLabel(event) {
  const distance =
    cleanValue(event.distance);

  const sport =
    cleanValue(event.sport);

  if (/backyard/i.test(distance)) {
    return "Backyard Ultra";
  }

  if (/\b\d{1,2}h\b/i.test(distance)) {
    return "Timed Ultra";
  }

  if (/miles?|ultra|trail|50\s?km|60\s?km|80\s?km|100\s?km/i.test(distance)) {
    return "Ultramarathon";
  }

  return sport || "Event";
}

const EVENT_STATUS_CONFIG = {
  confirmed: {
    label: "Confirmed",
    className: "confirmed"
  },
  date_expected: {
    label: "Date expected",
    className: "date-expected"
  },
  registration_open: {
    label: "Registration open",
    className: "registration-open"
  },
  registration_not_open: {
    label: "Registration not open yet",
    className: "registration-not-open"
  },
  sold_out: {
    label: "Sold out",
    className: "sold-out"
  },
  cancelled: {
    label: "Cancelled",
    className: "cancelled"
  },
  unclear: {
    label: "Unclear",
    className: "unclear"
  }
};

function normalizeEventStatus(value) {
  const status =
    cleanValue(value)
      .toLowerCase()
      .replace(/\s+/g, "_");

  return EVENT_STATUS_CONFIG[status]
    ? status
    : "unclear";
}

function getEventStatusConfig(event) {
  const status =
    normalizeEventStatus(
      event.verification_status
    );

  return {
    status,
    ...EVENT_STATUS_CONFIG[status],
    label:
      typeof window.t === "function"
        ? window.t(`status.${status}`, EVENT_STATUS_CONFIG[status].label)
        : EVENT_STATUS_CONFIG[status].label
  };
}

function createEventStatusBadge(event) {
  const config =
    getEventStatusConfig(event);

  return `
    <span class="event-status-badge ${config.className}">
      ${escapeHTML(config.label)}
    </span>
  `;
}

function createEventStatusBar(event, detailUrl = "") {
  const config =
    getEventStatusConfig(event);

  return `
    <div class="event-status-bar ${config.className}">
      <span class="event-status-content">
        <span class="event-status-dot" aria-hidden="true"></span>
        <span class="event-status-text">
          ${escapeHTML(config.label)}
        </span>
      </span>
      ${
        detailUrl
          ? `<a class="event-status-action" href="${detailUrl}" data-event-detail-link>Details</a>`
          : `<button class="event-status-action" type="button" data-event-drawer-button>Details</button>`
      }
    </div>
  `;
}

function createDrawerStatusPill(event) {
  const config =
    getEventStatusConfig(event);

  return `
    <div
      class="drawer-status-pill ${config.className}"
      title="${escapeHTML(config.label)}"
      aria-label="Status: ${escapeHTML(config.label)}"
      data-status-label="${escapeHTML(config.label)}"
    >
      <span class="event-status-dot" aria-hidden="true"></span>
    </div>
  `;
}

function getShareableEventLink(event) {
  const url =
    safeUrl(event.event_url);

  if (url && url !== "#") {
    return url;
  }

  return window.location.href;
}

function copyEventLink(event) {
  const link =
    getShareableEventLink(event);

  if (
    navigator.clipboard &&
    navigator.clipboard.writeText
  ) {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        if (typeof showAppMessage === "function") {
          showAppMessage(
            "Link copied",
            "The event link has been copied."
          );
        }
      })
      .catch(() => {
        window.prompt("Copy event link", link);
      });

    return;
  }

  window.prompt("Copy event link", link);
}

async function shareEvent(event) {
  const link =
    getShareableEventLink(event);

  const shareData = {
    title: cleanValue(event.event_name) || "Sport Event Map event",
    text: `${cleanValue(event.event_name)} · ${cleanValue(event.date)} · ${cleanValue(event.city)}`,
    url: link
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
    }
  }

  copyEventLink(event);
}


function parseCsvLine(line, delimiter = ";") {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes =
        !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseEventsCsv(text) {
  const lines =
    String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(line => line.trim());

  if (!lines.length) {
    return [];
  }

  const headers =
    parseCsvLine(lines[0])
      .map(header => header.trim());

  return lines
    .slice(1)
    .map(line => {
      const cells =
        parseCsvLine(line);

      return headers.reduce((row, header, index) => {
        row[header] =
          cells[index] || "";
        return row;
      }, {});
    });
}

async function fetchCsvEventsFallback(reason) {
  if (reason) {
    console.warn(
      "PapaParse CSV load failed. Using built-in fallback parser.",
      reason
    );
  } else {
    console.warn(
      "PapaParse unavailable. Loading CSV with built-in fallback parser."
    );
  }

  const response =
    await fetch("data/events.csv", {
      cache: "default"
    });

  if (!response.ok) {
    throw new Error(
      `CSV request failed with status ${response.status}`
    );
  }

  return parseEventsCsv(
    await response.text()
  );
}

async function loadCsvEvents() {
  if (csvEventsPromise) {
    return csvEventsPromise;
  }

  csvEventsPromise =
    (async () => {
  if (
    typeof Papa !== "undefined" &&
    Papa &&
    typeof Papa.parse === "function"
  ) {
    try {
      return await new Promise((resolve, reject) => {
        Papa.parse("data/events.csv", {
          download: true,
          header: true,
          delimiter: ";",
          complete(results) {
            resolve(results.data || []);
          },
          error
        });

        function error(errorValue) {
          reject(errorValue);
        }
      });
    } catch (error) {
      return fetchCsvEventsFallback(error);
    }
  }

  return fetchCsvEventsFallback();
    })()
      .catch(error => {
        csvEventsPromise = null;
        throw error;
      });

  return csvEventsPromise;
}


// LOAD CSV
async function loadEvents(callback) {
  let loadedEvents = [];

  try {
    const csvEvents =
      await loadCsvEvents();

      let dbEvents = [];

      try {
        if (
          typeof supabaseClient !== "undefined" &&
          supabaseClient
        ) {
          const {
            data,
            error
          } = await supabaseClient
            .from("events")
            .select("*")
            .eq("status", "approved");

          if (error) {
            console.error(
              "Supabase approved events query failed:",
              error
            );
            console.warn(
              "Approved Supabase events could not be loaded. CSV events remain available."
            );
          } else {
            dbEvents =
              data || [];
          }
        }
      } catch (error) {
        console.error(
          "Supabase approved events request failed:",
          error
        );
        console.warn(
          "Supabase is unavailable. CSV events remain available."
        );
      }

      console.log(
        "Loaded approved DB events:",
        dbEvents
      );

      events =
        normalizeEvents([
          ...csvEvents,
          ...dbEvents
        ]);

      migrateLocalPlanningKeys(events);

      loadedEvents =
        events;

      if (typeof window.updateLandingEventCount === "function") {
        window.updateLandingEventCount(loadedEvents);
      }

      processPendingSeasonAdd();
  } catch (error) {
    console.error(
      "CSV event loading failed:",
      error
    );

    events = [];
    loadedEvents =
      events;

    if (typeof showAppMessage === "function") {
      showAppMessage(
        "Events unavailable",
        "The event database could not be loaded. Please refresh the page or try again later."
      );
    }
  }

  try {
    callback(loadedEvents);
  } catch (error) {
    console.error(
      "Event render callback failed:",
      error
    );
  }
}


// POPUP
function createPopup(event) {
  const detailUrl =
    getEventDetailUrl(event);

  return `

    <div class="popup-card">

      <div class="popup-chip">
        ${escapeHTML(getEventFormatLabel(event))}
      </div>

      ${createEventStatusBadge(event)}

      <div class="popup-title">
        ${escapeHTML(event.event_name)}
      </div>

      <div class="popup-meta-grid">
        <span>
          &#128197; ${escapeHTML(event.date)}
        </span>
        <span>
          &#128205; ${escapeHTML(event.city)}, ${escapeHTML(event.country)}
        </span>
      </div>

      <div class="popup-distance">
        ${escapeHTML(event.distance)}
      </div>

      <a
        class="popup-link"
        href="${safeUrl(event.event_url)}"
        target="_blank"
        rel="noopener noreferrer"
        data-popup-website="${escapeHTML(getEventKey(event))}"
      >
        Official Website
      </a>

      ${
        detailUrl
          ? `<a class="popup-detail-link" href="${detailUrl}">Details</a>`
          : `<button class="popup-detail-link" type="button" data-popup-drawer="${escapeHTML(getEventKey(event))}">Details</button>`
      }

    </div>

  `;

}


// EVENT LIST
function renderEventList(events, options = {}) {

  currentRenderedEvents =
    Array.isArray(events)
      ? events
      : [];

  if (!options.preservePage) {
    eventListPage = 1;
  }

  const container =
    document.getElementById(
      "eventList"
    );

  container.innerHTML = "";

  const visibleEvents =
    getVisibleEventListPage(
      currentRenderedEvents
    );

  updateEventListControls(
    currentRenderedEvents
  );

  if (!currentRenderedEvents.length) {
    const emptyTitle =
      options.emptyTitle ||
      "Keine passenden Events gefunden";

    const emptyText =
      options.emptyText ||
      "Passe deine Suche oder Filter an.";

    const showReset =
      options.showReset !== false;

    container.innerHTML = `
      <div class="event-list-empty">
        <strong>${escapeHTML(emptyTitle)}</strong>
        <span>${escapeHTML(emptyText)}</span>
        ${
          showReset
            ? `
              <button
                type="button"
                class="event-empty-reset-btn"
              >
                Filter zurücksetzen
              </button>
            `
            : ""
        }
      </div>
    `;

    const resetEmptyButton =
      container.querySelector(".event-empty-reset-btn");

    if (resetEmptyButton) {
      resetEmptyButton.addEventListener(
        "click",
        () => {
          if (typeof resetAllFilters === "function") {
            resetAllFilters();
          }
        }
      );
    }

    return;
  }

  const fragment =
    document.createDocumentFragment();

  visibleEvents.forEach(event => {
    const detailUrl =
      getEventDetailUrl(event);

    const div =
      document.createElement("div");

    div.className = "event-card";
    div.dataset.testid = "event-card";

    div.dataset.key =
      getEventKey(event);


    div.innerHTML = `

      <div class="event-top">

        <div>

          ${
            detailUrl
              ? `<a class="event-title event-title-link" href="${detailUrl}" data-event-detail-link>${escapeHTML(event.event_name)}</a>`
              : `<div class="event-title">${escapeHTML(event.event_name)}</div>`
          }

        </div>

        <button
          class="favorite-btn ${isFavorite(event) ? "active" : ""}"
          type="button"
          aria-label="Toggle favorite"
          data-testid="event-card-favorite"
        >
          ${isFavorite(event) ? "&#10084;" : "&#9825;"}
        </button>

      </div>


      <div class="event-facts-grid">
        <div>
          <span>${window.t ? window.t("event.date") : "Date"}</span>
          <strong>${escapeHTML(event.date)}</strong>
        </div>
        <div>
          <span>${window.t ? window.t("event.distance") : "Distance"}</span>
          <strong>${escapeHTML(event.distance)}</strong>
        </div>
        <div class="event-location-fact">
          <span>${window.t ? window.t("event.location") : "Location"}</span>
          <strong>${escapeHTML(event.city)}, ${escapeHTML(event.country)}</strong>
        </div>
      </div>

      ${createEventStatusBar(event, detailUrl)}

    `;


    const favoriteBtn =
      div.querySelector(".favorite-btn");

    favoriteBtn.addEventListener(
      "click",
      clickEvent => {

        clickEvent.stopPropagation();

        toggleFavorite(event);

      }
    );

    div
      .querySelectorAll("[data-event-detail-link]")
      .forEach(link => {
        link.addEventListener(
          "click",
          clickEvent => {
            clickEvent.stopPropagation();
          }
        );
      });

    div
      .querySelectorAll("[data-event-drawer-button]")
      .forEach(button => {
        button.addEventListener(
          "click",
          clickEvent => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            openDrawer(event);
          }
        );
      });


    // HOVER
    div.addEventListener(
      "mouseenter",
      () => {

        const found =
          allMarkers.find(

            item =>

              getEventKey(item.data)
              ===
              getEventKey(event)

          );

        if (found) {

          found.marker.openPopup();

        }

      }
    );


    // CLICK
    div.addEventListener(
      "click",
      () => {

        if (typeof trackEvent === "function") {
          trackEvent("event_card_clicked", {
            event_id: getEventKey(event),
            sport: event.sport || "",
            source: document.body.classList.contains("event-list-fullscreen")
              ? "fullscreen_list"
              : "event_list"
          });
        }

        if (
          typeof focusEvent === "function" &&
          !document.body.classList.contains(
            "event-list-fullscreen"
          )
        ) {
          focusEvent(event);
        }

        openDrawer(event);

      }
    );


    fragment.appendChild(div);

  });

  container.appendChild(fragment);

}


// HIGHLIGHT CARD
function highlightCard(eventKey) {

  document
    .querySelectorAll(".event-card")
    .forEach(card => {

      if (
        card.dataset.key
        ===
        eventKey
      ) {

        card.classList.add(
          "active"
        );

      }

      else {

        card.classList.remove(
          "active"
        );

      }

    });

}


// DRAWER
function openDrawer(event) {

  const trackedKey =
    getEventKey(event);

  const detailUrl =
    getEventDetailUrl(event);

  const now =
    Date.now();

  if (typeof window.updatePlatformEventRoute === "function") {
    window.updatePlatformEventRoute(event);
  }

  if (
    typeof trackEvent === "function" &&
    (
      lastTrackedEventOpen.key !== trackedKey ||
      now - lastTrackedEventOpen.at > 1000
    )
  ) {
    trackEvent("event_detail_opened", {
      event_id: trackedKey,
      sport: event.sport || "",
      source: document.body.classList.contains("event-list-fullscreen")
        ? "fullscreen_list"
        : "map_or_list"
    });

    lastTrackedEventOpen = {
      key: trackedKey,
      at: now
    };
  }

  const drawer =
    document.getElementById(
      "eventDrawer"
    );

  const content =
    document.getElementById(
      "drawerContent"
    );


  content.innerHTML = `

    <button id="closeDrawer" data-testid="drawer-close">
      &times;
    </button>


    <div class="drawer-titlebar">

      <div class="drawer-title-icon" aria-hidden="true">
        ${getSportIconMarkup(event)}
      </div>

      <div class="drawer-title-copy">

        <div class="drawer-title-kicker">
          ${escapeHTML(getEventFormatLabel(event))}
        </div>

        <h2 data-testid="drawer-event-name">
          ${escapeHTML(event.event_name)}
        </h2>

        <div class="drawer-title-meta">
          ${escapeHTML(event.date)} &middot;
          ${escapeHTML(event.city)}, ${escapeHTML(event.country)}
        </div>

      </div>

      ${createDrawerStatusPill(event)}

      <button
        class="drawer-favorite-btn ${isFavorite(event) ? "active" : ""}"
        type="button"
        aria-label="Toggle favorite"
        data-event-key="${escapeHTML(getEventKey(event))}"
        data-testid="drawer-favorite"
      >
        ${isFavorite(event) ? "&#10084;" : "&#9825;"}
      </button>

    </div>

    <div class="drawer-action-row">
      <button
        class="drawer-season-btn ${isFavorite(event) ? "active" : ""}"
        type="button"
        data-event-key="${escapeHTML(getEventKey(event))}"
        data-testid="drawer-add-to-planner"
      >
        ${isFavorite(event) ? "Saved in Season" : "Add to Season"}
      </button>

      <button
        class="drawer-copy-btn"
        type="button"
      >
        Copy event link
      </button>

      <button
        class="drawer-share-btn"
        type="button"
      >
        Teilen
      </button>
    </div>


    <div class="drawer-section">

      <div class="drawer-label">
        ${window.t ? window.t("event.overview") : "Overview"}
      </div>

      <div class="drawer-overview-grid">

        <div>
          <span>${window.t ? window.t("event.date") : "Date"}</span>
          <strong>${escapeHTML(event.date)}</strong>
        </div>

        <div>
          <span>${window.t ? window.t("event.distance") : "Distance"}</span>
          <strong>${escapeHTML(event.distance)}</strong>
        </div>

        <div>
          <span>${window.t ? window.t("event.location") : "Location"}</span>
          <strong>${escapeHTML(event.city)}, ${escapeHTML(event.country)}</strong>
        </div>

        <div>
          <span>${window.t ? window.t("filter.sport") : "Sport"}</span>
          <strong>${escapeHTML(getEventFormatLabel(event))}</strong>
        </div>

      </div>

    </div>


    <div class="drawer-section">

      <div class="drawer-label">
        ${window.t ? window.t("event.stats") : "Event stats"}
      </div>

      <div class="event-stats-list">
        ${createEventStatsMarkup(event)}
      </div>

    </div>

    <div class="drawer-trust-note">
      <strong>Verify before registering</strong>
      <span>
        Event data may change. The official organizer website is the source of truth.
        ${
          event.last_checked
            ? `Last checked: ${escapeHTML(event.last_checked)}.`
            : ""
        }
      </span>
    </div>

    ${
      detailUrl
        ? `<a class="drawer-detail-button" href="${detailUrl}">Open detail page</a>`
        : ""
    }


    <a
      class="drawer-button"
      href="${safeUrl(event.event_url)}"
      target="_blank"
      rel="noopener noreferrer"
    >
      ${window.t ? window.t("event.officialWebsite") : "Official Website"}
    </a>

  `;

  const websiteButton =
    content.querySelector(".drawer-button");

  if (websiteButton) {
    websiteButton.addEventListener(
      "click",
      () => {
        if (typeof trackEvent === "function") {
          trackEvent("external_event_website_clicked", {
            event_id: trackedKey,
            sport: event.sport || "",
            url_host: (() => {
              try {
                return new URL(event.event_url).hostname;
              } catch (_error) {
                return "invalid_url";
              }
            })()
          });
        }
      }
    );
  }

  const drawerFavoriteBtn =
    content.querySelector(".drawer-favorite-btn");

  if (drawerFavoriteBtn) {

    drawerFavoriteBtn.addEventListener(
      "click",
      clickEvent => {

        clickEvent.stopPropagation();

        toggleFavorite(event);

      }
    );

  }

  const drawerSeasonBtn =
    content.querySelector(".drawer-season-btn");

  if (drawerSeasonBtn) {
    drawerSeasonBtn.addEventListener(
      "click",
      async clickEvent => {
        clickEvent.stopPropagation();

        drawerSeasonBtn.disabled = true;
        drawerSeasonBtn.textContent = "Saving...";

        const added =
          await addEventToSeasonPlanner(event, {
            source: "drawer_detail"
          });

        const active =
          added && isFavorite(event);

        drawerSeasonBtn.classList.toggle(
          "active",
          active
        );

        drawerSeasonBtn.textContent =
          active
            ? "Saved in Season"
            : "Add to Season";

        drawerSeasonBtn.disabled = false;
      }
    );
  }

  const copyButton =
    content.querySelector(".drawer-copy-btn");

  if (copyButton) {
    copyButton.addEventListener(
      "click",
      () => copyEventLink(event)
    );
  }

  const shareButton =
    content.querySelector(".drawer-share-btn");

  if (shareButton) {
    shareButton.addEventListener(
      "click",
      () => shareEvent(event)
    );
  }

  drawer.classList.add("open");

  if (
    document.body.classList.contains(
      "event-list-fullscreen"
    )
  ) {
    document.body.classList.add(
      "fullscreen-drawer-open"
    );
  }


  if (typeof refreshMapLayout === "function") {
    refreshMapLayout(350);
  }


  document
    .getElementById(
      "closeDrawer"
    )
    .addEventListener(
      "click",
      () => {

        drawer.classList.remove(
          "open"
        );

        document.body.classList.remove(
          "fullscreen-drawer-open"
        );

        if (typeof refreshMapLayout === "function") {
          refreshMapLayout(350);
        }

        if (typeof window.closePlatformEventRoute === "function") {
          window.closePlatformEventRoute();
        }

      }
    );

}


window.openDrawer = openDrawer;


// FAVORITES
function toggleFavorite(event) {

  const key =
    getEventKey(event);
  const aliases =
    new Set(getEventKeyAliases(event));

  const wasFavorite =
    favorites.some(favorite =>
      aliases.has(favorite)
    );

  favorites =
    favorites.filter(
      favorite =>
        !aliases.has(favorite)
    );

  if (!wasFavorite) {
    favorites.push(key);
  }

  const isNowFavorite =
    !wasFavorite;

  if (
    typeof trackEvent === "function" &&
    wasFavorite !== isNowFavorite
  ) {
    trackEvent(
      isNowFavorite
        ? "favorite_added"
        : "favorite_removed",
      {
        event_id: key,
        sport: event.sport || ""
      }
    );

    trackEvent(
      isNowFavorite
        ? "season_event_added"
        : "season_event_removed",
      {
        event_id: key,
        sport: event.sport || ""
      }
    );
  }

  if (
    wasFavorite !== isNowFavorite &&
    typeof showToast === "function"
  ) {
    showToast(
      isNowFavorite
        ? "Favorite added"
        : "Favorite removed",
      isNowFavorite
        ? "This race was added to your Season Planner."
        : "This race was removed from your saved events."
    );
  }


  saveFavorites();

  if (
    typeof window.syncFavoriteToSupabase === "function"
  ) {
    window.syncFavoriteToSupabase(
      event,
      isNowFavorite
    );
  }

  updateFavoriteButtons(event);

  const seasonPlanner =
    document.getElementById("seasonPlannerModal");

  if (
    seasonPlanner &&
    seasonPlanner.classList.contains("open")
  ) {
    renderSeasonPlanner();
  }

  if (
    typeof showingFavorites !== "undefined" &&
    showingFavorites
  ) {

    const favoriteMarkers =
      allMarkers.filter(item =>
        isFavorite(item.data)
      );

    if (typeof setVisibleMapMarkers === "function") {
      setVisibleMapMarkers(favoriteMarkers);
    }
    else {
      markerLayer.clearLayers();

      favoriteMarkers.forEach(item => {

        markerLayer.addLayer(
          item.marker
        );

      });
    }

    renderEventList(
      favoriteMarkers.map(
        item => item.data
      )
    );

    return;

  }

}

function updateFavoriteButtons(event) {
  const key =
    getEventKey(event);

  const active =
    isFavorite(event);

  document
    .querySelectorAll(".event-card")
    .forEach(card => {
      if (card.dataset.key !== key) {
        return;
      }

      const button =
        card.querySelector(".favorite-btn");

      if (!button) {
        return;
      }

      button.classList.toggle("active", active);
      button.innerHTML =
        active
          ? "&#10084;"
          : "&#9825;";

      button.classList.remove("favorite-pulse");
      void button.offsetWidth;
      button.classList.add("favorite-pulse");
    });

  document
    .querySelectorAll(".drawer-favorite-btn")
    .forEach(button => {
      if (button.dataset.eventKey !== key) {
        return;
      }

      button.classList.toggle("active", active);
      button.innerHTML =
        active
          ? "&#10084;"
          : "&#9825;";

      button.classList.remove("favorite-pulse");
      void button.offsetWidth;
      button.classList.add("favorite-pulse");
    });

  document
    .querySelectorAll(".drawer-season-btn")
    .forEach(button => {
      if (button.dataset.eventKey !== key) {
        return;
      }

      button.classList.toggle("active", active);
      button.textContent =
        active
          ? "Saved in Season"
          : "Add to Season";
    });
}


let seasonCountdownTimer = null;
let selectedSeasonEventKey = "";
let seasonEditingEventKey = "";
let seasonMobileEventDetailOpen = false;
let seasonEventsListScrollTop = 0;

function getSeasonPlannerScrollContainer() {
  const plannerModal =
    document.getElementById("seasonPlannerModal");

  if (plannerModal?.classList.contains("season-planner-page-mode")) {
    return document.querySelector(".platform-pages");
  }

  return document.querySelector(
    "#seasonPlannerModal .season-planner-card"
  );
}

function captureSeasonPlannerViewState() {
  const scrollContainer =
    getSeasonPlannerScrollContainer();

  return {
    activeTab:
      document.querySelector(".season-tab.active")
        ?.dataset.seasonTab || "overview",
    scrollTop:
      scrollContainer
        ? scrollContainer.scrollTop
        : 0
  };
}

function restoreSeasonPlannerViewState(state, nextTabName) {
  const tabName =
    nextTabName ||
    state?.activeTab ||
    "overview";

  setSeasonTab(tabName);

  const scrollContainer =
    getSeasonPlannerScrollContainer();

  if (
    !scrollContainer ||
    !Number.isFinite(state?.scrollTop)
  ) {
    return;
  }

  const scrollTop =
    Math.max(0, state.scrollTop);

  const restoreScroll = () => {
    scrollContainer.scrollTop =
      scrollTop;
  };

  restoreScroll();

  const scheduleRestore =
    window.requestAnimationFrame ||
    ((callback) => window.setTimeout(callback, 0));

  scheduleRestore(restoreScroll);
}

function renderSeasonPlannerPreservingView(nextTabName) {
  const state =
    captureSeasonPlannerViewState();

  renderSeasonPlanner();
  restoreSeasonPlannerViewState(
    state,
    nextTabName
  );
}

function readSelectedSeasonEventKey() {
  if (selectedSeasonEventKey) {
    return selectedSeasonEventKey;
  }

  try {
    selectedSeasonEventKey =
      localStorage.getItem("seasonSelectedEventKey") || "";
  } catch (_error) {
    selectedSeasonEventKey = "";
  }

  return selectedSeasonEventKey;
}

function writeSelectedSeasonEventKey(eventKey) {
  selectedSeasonEventKey =
    cleanValue(eventKey);

  try {
    if (selectedSeasonEventKey) {
      localStorage.setItem(
        "seasonSelectedEventKey",
        selectedSeasonEventKey
      );
    } else {
      localStorage.removeItem(
        "seasonSelectedEventKey"
      );
    }
  } catch (_error) {
    // The selection is purely UI state; storage errors should not block planning.
  }
}

function usesSeasonListDetailNavigation() {
  return Boolean(
    window.matchMedia?.(
      "(max-width: 900px), (max-width: 1024px) and (orientation: portrait)"
    ).matches
  );
}

function syncSeasonMobileEventView() {
  const panel =
    document.getElementById("seasonEventsPanel");
  const backButton =
    document.getElementById("seasonEventsBackButton");
  const showDetail =
    usesSeasonListDetailNavigation() &&
    seasonMobileEventDetailOpen &&
    Boolean(readSelectedSeasonEventKey());

  panel?.classList.toggle(
    "season-mobile-detail-open",
    showDetail
  );

  if (backButton) {
    backButton.hidden = !showDetail;
    backButton.setAttribute(
      "aria-hidden",
      showDetail ? "false" : "true"
    );
  }
}

function closeSeasonMobileEventDetail({ restoreList = true } = {}) {
  seasonMobileEventDetailOpen = false;
  seasonEditingEventKey = "";
  syncSeasonMobileEventView();

  if (!restoreList) {
    return;
  }

  window.requestAnimationFrame(() => {
    const listPanel =
      document.querySelector(
        "#seasonEventsPanel .season-events-list-panel"
      );

    if (listPanel) {
      listPanel.scrollTop = seasonEventsListScrollTop;
    }
  });
}

function getSelectedSeasonEventKey(favoriteEvents = []) {
  const savedKey =
    readSelectedSeasonEventKey();
  const hasSavedEvent =
    favoriteEvents.some(event =>
      getEventKey(event) === savedKey
    );

  if (hasSavedEvent) {
    return savedKey;
  }

  const fallbackEvent =
    getUpcomingSeasonEvents(favoriteEvents)[0] ||
    favoriteEvents[0];
  const fallbackKey =
    fallbackEvent
      ? getEventKey(fallbackEvent)
      : "";

  writeSelectedSeasonEventKey(fallbackKey);
  return fallbackKey;
}

function getSeasonPlanMeta() {
  try {
    return JSON.parse(
      localStorage.getItem("seasonPlanMeta")
    ) || {};
  } catch (_error) {
    return {};
  }
}

function saveSeasonPlanMeta(meta) {
  localStorage.setItem(
    "seasonPlanMeta",
    JSON.stringify(meta)
  );
}

function getDefaultPlannerDetails() {
  return {
    personal_note: "",
    goals: {
      goal_type: "",
      goal_status: "open",
      target_time: "",
      targetTimeSeconds: null,
      target_pace: "",
      targetPaceSecondsPerKm: null,
      personal_best_time: "",
      target_improvement: "",
      target_place_overall: "",
      target_place_gender: "",
      target_place_age_group: "",
      target_description: "",
      custom_goal: "",
      training_purpose: "",
      intensity_goal: "",
      strategy_status: "open",
      notes_status: "open"
    },
    logistics: {
      travel_status: "",
      accommodation_status: "",
      bib_status: "",
      travel_booked: false,
      accommodation_booked: false,
      registration_confirmed: false,
      bib_number: "",
      travel_note: ""
    },
    equipment: {
      status: "open",
      template: "",
      checked: {},
      items: [],
      removed: [],
      custom_input: ""
    },
    nutrition: {
      status: "open",
      type: "",
      timing_mode: "distance",
      entries: [],
      note: ""
    },
    post_race: {
      archived: false
    },
    result: {
      edit_mode: false,
      finish_status: "",
      finish_time: "",
      finishTimeSeconds: null,
      targetTimeSeconds: null,
      finish_pace: "",
      finishPaceSecondsPerKm: null,
      average_speed_kmh: "",
      swim_split: "",
      swimSplitSeconds: null,
      t1: "",
      t1Seconds: null,
      bike_split: "",
      bikeSplitSeconds: null,
      t2: "",
      t2Seconds: null,
      run_split: "",
      runSplitSeconds: null,
      elevation_gain_m: "",
      goalDeltaSeconds: null,
      distanceKm: null,
      distance_source: "official",
      distance_preset: "official",
      custom_distance_km: "",
      overall_place: "",
      gender_place: "",
      age_group_place: "",
      category: "",
      official_result_url: "",
      checkpoint_splits: "",
      race_report: "",
      dnf_time: "",
      dnf_distance: "",
      dnf_reason: "",
      dsq_reason: "",
      what_was_difficult: "",
      nutrition_worked: "",
      equipment_worked: "",
      would_repeat: "",
      key_learnings: "",
      went_well: "",
      next_time_change: "",
      personal_rating: ""
    }
  };
}

function isPlainPlannerObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizePlannerDetails(details = {}, legacyNote = "") {
  const defaults =
    getDefaultPlannerDetails();
  const safeDetails =
    isPlainPlannerObject(details)
      ? details
      : {};

  return {
    ...defaults,
    ...safeDetails,
    personal_note:
      cleanValue(
        safeDetails.personal_note ||
        legacyNote ||
        ""
      ),
    goals: {
      ...defaults.goals,
      ...(isPlainPlannerObject(safeDetails.goals)
        ? safeDetails.goals
        : {})
    },
    logistics: {
      ...defaults.logistics,
      ...(isPlainPlannerObject(safeDetails.logistics)
        ? safeDetails.logistics
        : {})
    },
    equipment: {
      ...defaults.equipment,
      ...(isPlainPlannerObject(safeDetails.equipment)
        ? safeDetails.equipment
        : {}),
      checked:
        isPlainPlannerObject(safeDetails.equipment?.checked)
          ? safeDetails.equipment.checked
          : {},
      items:
        Array.isArray(safeDetails.equipment?.items)
          ? safeDetails.equipment.items
          : [],
      removed:
        Array.isArray(safeDetails.equipment?.removed)
          ? safeDetails.equipment.removed
          : []
    },
    nutrition: {
      ...defaults.nutrition,
      ...(isPlainPlannerObject(safeDetails.nutrition)
        ? safeDetails.nutrition
        : {}),
      entries:
        Array.isArray(safeDetails.nutrition?.entries)
          ? safeDetails.nutrition.entries
          : []
    },
    post_race: {
      ...defaults.post_race,
      ...(isPlainPlannerObject(safeDetails.post_race)
        ? safeDetails.post_race
        : {})
    },
    result: {
      ...defaults.result,
      ...(isPlainPlannerObject(safeDetails.result)
        ? safeDetails.result
        : {})
    }
  };
}

function normalizeSeasonMetaEntry(entry = {}) {
  const safeEntry =
    isPlainPlannerObject(entry)
      ? entry
      : {};
  const note =
    cleanValue(
      safeEntry.note ||
      safeEntry.personal_note ||
      safeEntry.planner_details?.personal_note ||
      ""
    );
  const plannerDetails =
    normalizePlannerDetails(
      safeEntry.planner_details,
      note
    );

  return {
    ...safeEntry,
    priority:
      safeEntry.priority || "Maybe",
    distance:
      safeEntry.distance || "",
    note:
      note || plannerDetails.personal_note || "",
    planner_details:
      {
        ...plannerDetails,
        personal_note:
          note || plannerDetails.personal_note || ""
      }
  };
}

function getSeasonMetaEntry(eventOrKey) {
  const eventKey =
    typeof eventOrKey === "string"
      ? eventOrKey
      : getEventKey(eventOrKey);
  const meta =
    getSeasonPlanMeta();

  return normalizeSeasonMetaEntry(
    meta[eventKey] || {}
  );
}

function getSeasonPlannerDetails(eventOrKey) {
  return getSeasonMetaEntry(eventOrKey)
    .planner_details;
}

function setSeasonMetaEntry(eventKey, entryPatch = {}) {
  const meta =
    getSeasonPlanMeta();
  const previous =
    normalizeSeasonMetaEntry(
      meta[eventKey] || {}
    );
  const next =
    normalizeSeasonMetaEntry({
      ...previous,
      ...entryPatch
    });

  meta[eventKey] =
    next;

  saveSeasonPlanMeta(meta);
  return next;
}

function setNestedPlannerDetail(details, path, value) {
  const parts =
    String(path || "")
      .split(".")
      .filter(Boolean);
  const next =
    normalizePlannerDetails(details);
  let cursor =
    next;

  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] =
        value;
      return;
    }

    cursor[part] =
      isPlainPlannerObject(cursor[part])
        ? cursor[part]
        : {};
    cursor =
      cursor[part];
  });

  return next;
}

function setSeasonPlannerDetailField(eventKey, path, value) {
  const previous =
    getSeasonMetaEntry(eventKey);
  const event =
    findSeasonEventByKey(eventKey);
  const rawPlannerDetails =
    setNestedPlannerDetail(
      previous.planner_details,
      path,
      value
    );

  if (path === "goals.target_time" && !cleanValue(value)) {
    rawPlannerDetails.goals.targetTimeSeconds =
      null;
    rawPlannerDetails.goals.targetPaceSecondsPerKm =
      null;
    rawPlannerDetails.goals.target_pace =
      "";
    rawPlannerDetails.result.targetTimeSeconds =
      null;
    rawPlannerDetails.result.goalDeltaSeconds =
      null;
  }

  if (path === "goals.target_time" && cleanValue(value)) {
    const targetSeconds =
      parseSeasonDuration(value);

    rawPlannerDetails.goals.targetTimeSeconds =
      Number.isFinite(targetSeconds)
        ? targetSeconds
        : null;
    rawPlannerDetails.result.targetTimeSeconds =
      rawPlannerDetails.goals.targetTimeSeconds;
  }

  if (path === "result.finish_time" && !cleanValue(value)) {
    rawPlannerDetails.result.finishTimeSeconds =
      null;
    rawPlannerDetails.result.finishPaceSecondsPerKm =
      null;
    rawPlannerDetails.result.finish_pace =
      "";
    rawPlannerDetails.result.goalDeltaSeconds =
      null;
  }

  if (path === "result.finish_time" && cleanValue(value)) {
    const finishSeconds =
      parseSeasonDuration(value);

    rawPlannerDetails.result.finishTimeSeconds =
      Number.isFinite(finishSeconds)
        ? finishSeconds
        : null;
  }

  [
    ["result.swim_split", "swimSplitSeconds"],
    ["result.t1", "t1Seconds"],
    ["result.bike_split", "bikeSplitSeconds"],
    ["result.t2", "t2Seconds"],
    ["result.run_split", "runSplitSeconds"]
  ].forEach(([fieldPath, secondsKey]) => {
    if (path !== fieldPath) {
      return;
    }

    const seconds =
      cleanValue(value)
        ? parseSeasonDuration(value)
        : null;

    rawPlannerDetails.result[secondsKey] =
      Number.isFinite(seconds)
        ? seconds
        : null;
  });

  const plannerDetails =
    normalizeSeasonPlannerCalculations(
      rawPlannerDetails,
      event
    );
  const note =
    path === "personal_note"
      ? cleanValue(value)
      : previous.note;
  const next =
    setSeasonMetaEntry(
      eventKey,
      {
        note,
        planner_details: {
          ...plannerDetails,
          personal_note:
            note || plannerDetails.personal_note || ""
        }
      }
    );

  if (
    typeof window.syncSeasonPlanMetaToSupabase === "function"
  ) {
    window.syncSeasonPlanMetaToSupabase(
      eventKey,
      {
        note: next.note,
        planner_details:
          next.planner_details
      }
    );
  }
}

function getSeasonPriority(event) {
  return getSeasonMetaEntry(event).priority || "Maybe";
}

function setSeasonPriority(eventKey, priority) {
  setSeasonMetaEntry(
    eventKey,
    { priority }
  );

  if (
    typeof window.syncSeasonPlanMetaToSupabase === "function"
  ) {
    window.syncSeasonPlanMetaToSupabase(
      eventKey,
      { priority }
    );
  }
}

function getSeasonPlannedDistance(event) {
  return getSeasonMetaEntry(event).distance || "";
}

function setSeasonPlannedDistance(eventKey, distance) {
  setSeasonMetaEntry(
    eventKey,
    { distance }
  );

  if (
    typeof window.syncSeasonPlanMetaToSupabase === "function"
  ) {
    window.syncSeasonPlanMetaToSupabase(
      eventKey,
      { distance }
    );
  }
}

function getSeasonNote(event) {
  return getSeasonMetaEntry(event).note || "";
}

function setSeasonNote(eventKey, note) {
  const previous =
    getSeasonMetaEntry(eventKey);
  const plannerDetails =
    normalizePlannerDetails(
      {
        ...previous.planner_details,
        personal_note:
          note
      },
      note
    );
  const next =
    setSeasonMetaEntry(
      eventKey,
      {
        note,
        planner_details:
          plannerDetails
      }
    );

  if (
    typeof window.syncSeasonPlanMetaToSupabase === "function"
  ) {
    window.syncSeasonPlanMetaToSupabase(
      eventKey,
      {
        note: next.note,
        planner_details:
          next.planner_details
      }
    );
  }
}

function getSeasonPlannerDetailsForEvent(event) {
  return normalizeSeasonPlannerCalculations(
    getSeasonPlannerDetails(
      getEventKey(event)
    ),
    event
  );
}

function getSeasonDistanceOptions(event) {
  const rawDistance =
    cleanValue(event.distance);

  if (!rawDistance) {
    return [];
  }

  return rawDistance
    .split(/\s*(?:\/|,|\||;|\+)\s*/g)
    .map(option => cleanValue(option))
    .filter(Boolean)
    .filter((option, index, list) =>
      list.findIndex(item =>
        item.toLowerCase() === option.toLowerCase()
      ) === index
    );
}

function getSeasonDisplayDistance(event) {
  return getSeasonPlannedDistance(event) ||
    cleanValue(event.distance);
}

function seasonPlannerText(key, fallback = "") {
  if (!key) {
    return fallback;
  }

  return typeof window.t === "function"
    ? window.t(key, fallback)
    : fallback;
}

function isSeasonEventPast(event) {
  const eventDate =
    parseSeasonEndDate(event.date);

  if (!eventDate) {
    return false;
  }

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return getLocalDateStart(eventDate) < today;
}

function parseSeasonDuration(value) {
  const text =
    cleanValue(value);

  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) {
    return null;
  }

  const parts =
    text.split(":").map(Number);

  if (
    parts.some(part => Number.isNaN(part)) ||
    parts.some((part, index) => index > 0 && part > 59)
  ) {
    return null;
  }

  return parts.length === 2
    ? parts[0] * 60 + parts[1]
    : parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatSeasonDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "";
  }

  const safeSeconds =
    Math.max(0, Math.round(seconds));
  const hours =
    Math.floor(safeSeconds / 3600);
  const minutes =
    Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds =
    safeSeconds % 60;

  if (hours) {
    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(remainingSeconds).padStart(2, "0")
    ].join(":");
  }

  return [
    String(minutes),
    String(remainingSeconds).padStart(2, "0")
  ].join(":");
}

function formatSeasonPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return "";
  }

  const rounded =
    Math.round(secondsPerKm);
  const minutes =
    Math.floor(rounded / 60);
  const seconds =
    rounded % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function formatSeasonSwimPace(secondsPer100m) {
  if (!Number.isFinite(secondsPer100m) || secondsPer100m <= 0) {
    return "";
  }

  const rounded =
    Math.round(secondsPer100m);
  const minutes =
    Math.floor(rounded / 60);
  const seconds =
    rounded % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/100m`;
}

function formatSeasonSpeedKmh(kmh) {
  if (!Number.isFinite(kmh) || kmh <= 0) {
    return "";
  }

  return `${kmh.toFixed(kmh >= 10 ? 1 : 2)} km/h`;
}

function getSeasonSportType(event) {
  const context =
    `${event?.sport || ""} ${event?.distance || ""} ${event?.event_name || ""}`
      .toLowerCase();

  if (/triathlon|ironman|70\.3|duathlon/.test(context)) {
    return "triathlon";
  }

  if (/cycling|bike|radrennen|radmarathon|gravel/.test(context)) {
    return "cycling";
  }

  if (/swimming|swim|schwimmen|open water|open-water/.test(context)) {
    return "swimming";
  }

  if (/ultra|trail|berglauf|mountain|skyrace/.test(context)) {
    return "ultra";
  }

  return "running";
}

function getSeasonPerformanceMetric({ event, seconds, distanceKm }) {
  const sportType =
    getSeasonSportType(event);

  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0
  ) {
    return {
      label: "",
      value: "",
      type: sportType
    };
  }

  if (sportType === "triathlon") {
    return {
      label: "",
      value: "",
      type: sportType
    };
  }

  if (sportType === "cycling") {
    const speedKmh =
      distanceKm / (seconds / 3600);

    return {
      label: seasonPlannerText("season.avgSpeed", "Avg speed"),
      value: formatSeasonSpeedKmh(speedKmh),
      type: sportType,
      rawKmh: speedKmh
    };
  }

  if (sportType === "swimming") {
    return {
      label: seasonPlannerText("season.swimPace", "Pace"),
      value: formatSeasonSwimPace(seconds / (distanceKm * 10)),
      type: sportType
    };
  }

  return {
    label: seasonPlannerText("season.pace", "Pace"),
    value: formatSeasonPace(seconds / distanceKm),
    type: sportType
  };
}

function formatSeasonGoalDelta(seconds) {
  if (!Number.isFinite(seconds)) {
    return "";
  }

  if (seconds === 0) {
    return seasonPlannerText("profile.goalReached", "Goal reached");
  }

  const formatted =
    formatSeasonDuration(Math.abs(seconds));

  return seconds > 0
    ? `+${formatted} ${seasonPlannerText("profile.overTarget", "over target")}`
    : `-${formatted} ${seasonPlannerText("profile.underTarget", "under target")}`;
}

function getSeasonNumericSeconds(value) {
  if (
    value === null ||
    value === undefined ||
    cleanValue(value) === ""
  ) {
    return null;
  }

  const seconds =
    Number(value);

  return Number.isFinite(seconds) && seconds > 0
    ? seconds
    : null;
}

function getSeasonDurationParts(value) {
  const seconds =
    getSeasonNumericSeconds(value) !== null
      ? getSeasonNumericSeconds(value)
      : parseSeasonDuration(value);

  if (!Number.isFinite(seconds)) {
    return {
      hours: "",
      minutes: "",
      seconds: ""
    };
  }

  return {
    hours:
      String(Math.floor(seconds / 3600)),
    minutes:
      String(Math.floor((seconds % 3600) / 60)).padStart(2, "0"),
    seconds:
      String(Math.round(seconds % 60)).padStart(2, "0")
  };
}

function parseSeasonDistanceKm(value) {
  const text =
    cleanValue(value).toLowerCase();

  if (!text) {
    return null;
  }

  if (/half\s*marathon|halbmarathon/.test(text)) {
    return 21.0975;
  }

  if (/marathon/.test(text) && !/half|halb/.test(text)) {
    return 42.195;
  }

  if (/\b70\.3\b/.test(text)) {
    return 113;
  }

  if (/ironman|langdistanz/.test(text)) {
    return 226;
  }

  const kmMatch =
    /(\d+(?:[\.,]\d+)?)\s*(?:km|kilometer|kilometre|kilometers|kilometres)\b/.exec(text);

  if (kmMatch) {
    return Number(kmMatch[1].replace(",", "."));
  }

  const mileMatch =
    /(\d+(?:[\.,]\d+)?)\s*(?:mi|mile|miles)\b/.exec(text);

  if (mileMatch) {
    return Number(mileMatch[1].replace(",", ".")) * 1.609344;
  }

  return null;
}

function getSeasonOfficialDistanceKm(event) {
  return parseSeasonDistanceKm(
    [
      getSeasonPlannedDistance(event),
      event?.distance,
      event?.sport
    ].filter(Boolean).join(" ")
  );
}

function getSeasonDistancePresetOptions(event) {
  const sportContext =
    `${event?.sport || ""} ${event?.distance || ""} ${event?.event_name || ""}`
      .toLowerCase();
  const officialKm =
    getSeasonOfficialDistanceKm(event);
  const runningOptions = [
    { value: "5k", label: "5 km", km: 5 },
    { value: "10k", label: "10 km", km: 10 },
    { value: "half_marathon", label: "Half Marathon", km: 21.0975 },
    { value: "marathon", label: "Marathon", km: 42.195 }
  ];
  const triathlonOptions = [
    { value: "tri_sprint", label: "Sprint", km: 25.75 },
    { value: "tri_olympic", label: "Olympic", km: 51.5 },
    { value: "tri_703", label: "70.3", km: 113 },
    { value: "tri_ironman", label: "Ironman", km: 226 }
  ];

  return [
    {
      value: "official",
      label: officialKm
        ? `${seasonPlannerText("season.officialDistance", "Official distance")} (${officialKm.toFixed(officialKm % 1 ? 2 : 0)} km)`
        : seasonPlannerText("season.officialDistance", "Official distance"),
      km: officialKm
    },
    ...(/triathlon|ironman|70\.3/.test(sportContext)
      ? triathlonOptions
      : runningOptions),
    {
      value: "custom",
      label: seasonPlannerText("season.customDistance", "Custom"),
      km: null
    }
  ];
}

function getSeasonDistanceFromResult(result = {}, event) {
  const preset =
    result.distance_preset || result.distance_source || "official";

  if (preset === "custom") {
    const customDistance =
      Number(String(result.custom_distance_km || "").replace(",", "."));

    return Number.isFinite(customDistance) && customDistance > 0
      ? customDistance
      : null;
  }

  const match =
    getSeasonDistancePresetOptions(event)
      .find(option => option.value === preset);

  return match?.km ||
    getSeasonOfficialDistanceKm(event) ||
    null;
}

function findSeasonEventByKey(eventKey) {
  return events.find(event =>
    getEventKey(event) === eventKey
  );
}

function normalizeSeasonPlannerCalculations(details, event) {
  const next =
    normalizePlannerDetails(details);
  const goals =
    next.goals || {};
  const result =
    next.result || {};
  result.distance_preset =
    result.distance_preset ||
    result.distance_source ||
    "official";
  result.distance_source =
    result.distance_preset;
  const targetSeconds =
    getSeasonNumericSeconds(goals.targetTimeSeconds) !== null
      ? getSeasonNumericSeconds(goals.targetTimeSeconds)
      : parseSeasonDuration(goals.target_time);
  const finishSeconds =
    getSeasonNumericSeconds(result.finishTimeSeconds) !== null
      ? getSeasonNumericSeconds(result.finishTimeSeconds)
      : parseSeasonDuration(result.finish_time);
  const distanceKm =
    getSeasonDistanceFromResult(result, event);
  const sportType =
    getSeasonSportType(event);

  if (Number.isFinite(targetSeconds)) {
    goals.targetTimeSeconds =
      targetSeconds;
    goals.target_time =
      formatSeasonDuration(targetSeconds);
    result.targetTimeSeconds =
      targetSeconds;
  }

  if (Number.isFinite(finishSeconds)) {
    result.finishTimeSeconds =
      finishSeconds;
    result.finish_time =
      formatSeasonDuration(finishSeconds);
  }

  if (Number.isFinite(distanceKm) && distanceKm > 0) {
    result.distanceKm =
      Number(distanceKm.toFixed(3));
  }

  if (
    Number.isFinite(targetSeconds) &&
    Number.isFinite(distanceKm) &&
    distanceKm > 0 &&
    sportType !== "triathlon"
  ) {
    const targetMetric =
      getSeasonPerformanceMetric({
        event,
        seconds: targetSeconds,
        distanceKm
      });

    goals.targetPaceSecondsPerKm =
      sportType === "running"
        ? targetSeconds / distanceKm
        : null;
    goals.target_pace =
      targetMetric.value;
  } else if (sportType === "triathlon") {
    goals.targetPaceSecondsPerKm =
      null;
    goals.target_pace =
      "";
  }

  if (
    Number.isFinite(finishSeconds) &&
    Number.isFinite(distanceKm) &&
    distanceKm > 0 &&
    sportType !== "triathlon"
  ) {
    const finishMetric =
      getSeasonPerformanceMetric({
        event,
        seconds: finishSeconds,
        distanceKm
      });

    result.finishPaceSecondsPerKm =
      sportType === "running"
        ? finishSeconds / distanceKm
        : null;
    result.finish_pace =
      finishMetric.value;
    result.average_speed_kmh =
      sportType === "cycling"
        ? Number(finishMetric.rawKmh.toFixed(2))
        : result.average_speed_kmh || "";
  } else if (sportType === "triathlon") {
    result.finishPaceSecondsPerKm =
      null;
    result.finish_pace =
      "";
    result.average_speed_kmh =
      "";
  }

  [
    ["swim_split", "swimSplitSeconds"],
    ["t1", "t1Seconds"],
    ["bike_split", "bikeSplitSeconds"],
    ["t2", "t2Seconds"],
    ["run_split", "runSplitSeconds"]
  ].forEach(([field, secondsKey]) => {
    const splitSeconds =
      getSeasonNumericSeconds(result[secondsKey]) !== null
        ? getSeasonNumericSeconds(result[secondsKey])
        : parseSeasonDuration(result[field]);

    if (Number.isFinite(splitSeconds)) {
      result[secondsKey] =
        splitSeconds;
      result[field] =
        formatSeasonDuration(splitSeconds);
    }
  });

  if (
    Number.isFinite(targetSeconds) &&
    Number.isFinite(finishSeconds)
  ) {
    result.goalDeltaSeconds =
      finishSeconds - targetSeconds;
  }

  next.goals =
    goals;
  next.result =
    result;

  return next;
}

function renderSeasonPlannerTextField({
  eventKey,
  path,
  labelKey,
  fallback,
  value = "",
  placeholderKey = "",
  placeholder = "",
  type = "text"
}) {
  const testId =
    `planner-field-${cleanValue(path).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;

  return `
    <label class="season-detail-field">
      <span>${escapeHTML(seasonPlannerText(labelKey, fallback))}</span>
      <input
        type="${escapeHTML(type)}"
        data-season-detail-event="${escapeHTML(eventKey)}"
        data-season-detail-field="${escapeHTML(path)}"
        data-testid="${escapeHTML(testId)}"
        value="${escapeHTML(value)}"
        placeholder="${escapeHTML(seasonPlannerText(placeholderKey, placeholder))}"
      />
    </label>
  `;
}

function renderSeasonPlannerTextarea({
  eventKey,
  path,
  labelKey,
  fallback,
  value = "",
  placeholderKey = "",
  placeholder = "",
  legacyNote = false
}) {
  const testId =
    `planner-field-${cleanValue(path || "personal_note").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  const legacyAttributes =
    legacyNote
      ? `data-season-note="${escapeHTML(eventKey)}"`
      : `data-season-detail-event="${escapeHTML(eventKey)}" data-season-detail-field="${escapeHTML(path)}"`;

  return `
    <label class="season-detail-field season-detail-field-wide">
      <span>${escapeHTML(seasonPlannerText(labelKey, fallback))}</span>
      <textarea
        ${legacyAttributes}
        data-testid="${escapeHTML(testId)}"
        rows="2"
        maxlength="800"
        placeholder="${escapeHTML(seasonPlannerText(placeholderKey, placeholder))}"
      >${escapeHTML(value)}</textarea>
    </label>
  `;
}

function renderSeasonPlannerCheckbox({
  eventKey,
  path,
  labelKey,
  fallback,
  checked = false
}) {
  return `
    <label class="season-detail-check">
      <input
        type="checkbox"
        data-season-detail-event="${escapeHTML(eventKey)}"
        data-season-detail-field="${escapeHTML(path)}"
        ${checked ? "checked" : ""}
      />
      <span>${escapeHTML(seasonPlannerText(labelKey, fallback))}</span>
    </label>
  `;
}

const SEASON_GOAL_TYPES = [
  ["participate", "Einfach teilnehmen"],
  ["fun", "Spaß haben"],
  ["finish", "Finishen"],
  ["personal_best", "Persönliche Bestzeit"],
  ["target_time", "Bestimmte Zielzeit"],
  ["placement", "Platzierungsziel"],
  ["training", "Training / Testwettkampf"],
  ["custom", "Eigenes Ziel"]
];

const SEASON_AREA_STATUS_LABELS = {
  open: "Offen",
  done: "Erledigt",
  not_needed: "Nicht benötigt",
  planned: "Geplant"
};

function normalizeSeasonAreaStatus(value, fallback = "open") {
  const status =
    cleanValue(value);

  return [
    "open",
    "done",
    "not_needed",
    "planned"
  ].includes(status)
    ? status
    : fallback;
}

function getSeasonAreaStatus(details, path, doneFallback = false) {
  const parts =
    String(path || "")
      .split(".")
      .filter(Boolean);
  let cursor =
    details;

  parts.forEach(part => {
    cursor =
      cursor && typeof cursor === "object"
        ? cursor[part]
        : "";
  });

  return normalizeSeasonAreaStatus(
    cursor,
    doneFallback ? "done" : "open"
  );
}

function renderSeasonStatusSelect({
  eventKey,
  path,
  label,
  value,
  doneLabel = "Erledigt"
}) {
  const normalized =
    normalizeSeasonAreaStatus(value);

  return `
    <label class="season-status-select">
      <span>${escapeHTML(label)}</span>
      <select
        data-season-detail-event="${escapeHTML(eventKey)}"
        data-season-detail-field="${escapeHTML(path)}"
        data-testid="planner-field-${escapeHTML(cleanValue(path).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase())}"
      >
        <option value="open" ${normalized === "open" ? "selected" : ""}>Offen</option>
        <option value="done" ${normalized === "done" ? "selected" : ""}>${escapeHTML(doneLabel)}</option>
        <option value="not_needed" ${normalized === "not_needed" ? "selected" : ""}>Nicht benötigt</option>
      </select>
    </label>
  `;
}

function getSeasonGoalTypeLabel(type) {
  const match =
    SEASON_GOAL_TYPES.find(([value]) => value === type);

  return match ? match[1] : "Noch nicht gewählt";
}

function renderSeasonGoalTypeControl(eventKey, goals) {
  const activeType =
    cleanValue(goals.goal_type);

  return `
    <div class="season-goal-type-grid" role="group" aria-label="Zieltyp">
      ${SEASON_GOAL_TYPES.map(([value, label]) => `
        <button
          type="button"
          class="${activeType === value ? "active" : ""}"
          data-season-goal-type="${escapeHTML(value)}"
          data-season-goal-event="${escapeHTML(eventKey)}"
          data-testid="planner-goal-type-${escapeHTML(value)}"
          aria-pressed="${activeType === value ? "true" : "false"}"
        >
          ${escapeHTML(label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderSeasonGoalFields(eventKey, goals, targetMetricValue, resultMetricLabel) {
  const goalType =
    cleanValue(goals.goal_type);
  const targetTimeField =
    renderSeasonTimeInput({
      eventKey,
      path: "goals.target_time",
      labelKey: "season.targetTime",
      fallback: "Zielzeit",
      value: goals.target_time
    });
  const goalNote =
    renderSeasonPlannerTextarea({
      eventKey,
      path: "goals.target_description",
      labelKey: "season.targetDescription",
      fallback: "Zielnotiz",
      value: goals.target_description,
      placeholderKey: "season.goalPlaceholder",
      placeholder: "Was wäre für dich ein guter Renntag?"
    });

  if (!goalType) {
    return `
      <div class="season-empty-detail">
        <strong>Wähle zuerst, was dieses Event für dich sein soll.</strong>
        <span>Du kannst ohne Zielzeit planen. Spaßlauf, Training oder einfach teilnehmen sind gültige Ziele.</span>
      </div>
    `;
  }

  if (goalType === "participate" || goalType === "fun" || goalType === "finish") {
    return `
      <div class="season-detail-fields">
        ${goalNote}
        ${goalType === "finish" ? targetTimeField : ""}
      </div>
    `;
  }

  if (goalType === "personal_best") {
    return `
      <div class="season-detail-fields">
        ${renderSeasonTimeInput({ eventKey, path: "goals.personal_best_time", labelKey: "", fallback: "Bisherige Bestzeit", value: goals.personal_best_time })}
        ${renderSeasonPlannerTextField({ eventKey, path: "goals.target_improvement", labelKey: "", fallback: "Gewünschte Verbesserung", value: goals.target_improvement, placeholder: "z. B. 30 Sekunden" })}
        ${targetTimeField}
        ${goalNote}
      </div>
    `;
  }

  if (goalType === "target_time") {
    return `
      <div class="season-detail-fields">
        ${targetTimeField}
        ${targetMetricValue ? `
          <div class="season-calculated-box">
            ${renderSeasonCalculatedMetric("", resultMetricLabel, targetMetricValue)}
          </div>
        ` : ""}
        ${goalNote}
      </div>
    `;
  }

  if (goalType === "placement") {
    return `
      <div class="season-detail-fields">
        ${renderSeasonPlannerTextField({ eventKey, path: "goals.target_place_overall", labelKey: "season.targetPlaceOverall", fallback: "Ziel Gesamtplatz", value: goals.target_place_overall, placeholder: "100", type: "number" })}
        ${renderSeasonPlannerTextField({ eventKey, path: "goals.target_place_gender", labelKey: "", fallback: "Ziel Gender-Platz", value: goals.target_place_gender, placeholder: "42", type: "number" })}
        ${renderSeasonPlannerTextField({ eventKey, path: "goals.target_place_age_group", labelKey: "season.targetPlaceAgeGroup", fallback: "Ziel Altersklasse", value: goals.target_place_age_group, placeholder: "10", type: "number" })}
        ${goalNote}
      </div>
    `;
  }

  if (goalType === "training") {
    return `
      <div class="season-detail-fields">
        ${renderSeasonPlannerTextField({ eventKey, path: "goals.training_purpose", labelKey: "", fallback: "Trainingszweck", value: goals.training_purpose, placeholder: "Formtest, langer Lauf, Tempoarbeit..." })}
        ${renderSeasonPlannerTextField({ eventKey, path: "goals.intensity_goal", labelKey: "", fallback: "Belastungsziel", value: goals.intensity_goal, placeholder: "locker, kontrolliert, Race Pace..." })}
        ${goalNote}
      </div>
    `;
  }

  return `
    <div class="season-detail-fields">
      ${renderSeasonPlannerTextarea({ eventKey, path: "goals.custom_goal", labelKey: "", fallback: "Eigenes Ziel", value: goals.custom_goal, placeholder: "Beschreibe dein Ziel frei..." })}
      ${goalNote}
    </div>
  `;
}

function getSeasonEquipmentTemplateItems(event, template = "") {
  const sportType =
    getSeasonSportType(event);
  const selected =
    cleanValue(template).toLowerCase();
  const runningBase = [
    "Schuhe",
    "Socken",
    "Wettkampfkleidung",
    "Startnummernband",
    "Uhr",
    "Kappe",
    "Sonnenbrille",
    "Wechselkleidung"
  ];
  const triathlonBase = [
    "Neoprenanzug",
    "Schwimmbrille",
    "Badekappe",
    "Fahrrad",
    "Helm",
    "Radschuhe",
    "Laufschuhe",
    "Startnummernband",
    "Reparaturset",
    "Trinkflaschen"
  ];
  const trailBase = [
    "Trail-Schuhe",
    "Laufrucksack",
    "Pflichtausrüstung",
    "Softflasks",
    "Stirnlampe",
    "Rettungsdecke",
    "Regenjacke",
    "Wechselkleidung"
  ];

  if (sportType === "triathlon" || selected.includes("triathlon") || selected.includes("distanz")) {
    return triathlonBase;
  }

  if (sportType === "ultra" || selected.includes("trail")) {
    return trailBase;
  }

  return runningBase;
}

function getSeasonEquipmentPresetContext(event) {
  const sportText =
    cleanValue(event?.sport);
  const distanceText =
    cleanValue(getSeasonDisplayDistance(event));
  const nameText =
    cleanValue(event?.event_name);
  const sportContext =
    `${sportText} ${nameText}`.toLowerCase();
  const distanceContext =
    `${distanceText} ${nameText}`.toLowerCase();
  const sportType =
    getSeasonSportType(event);
  const hasSport =
    Boolean(sportText) ||
    /triathlon|ironman|duathlon|running|lauf|marathon|trail|ultra|cycling|rad|swim|schwimm/.test(sportContext);
  const hasDistance =
    Boolean(distanceText) ||
    /\b(5k|5 km|10k|10 km|halbmarathon|half marathon|marathon|sprint|olymp|mittel|middle|70\.3|lang|ironman|ultra|trail)\b/.test(distanceContext);

  return {
    sportType,
    distanceLabel: distanceText,
    hasAutoPreset:
      Boolean(hasSport && hasDistance),
    sourceLabel:
      [
        sportText || getSeasonSportLabel(sportType),
        distanceText
      ]
        .filter(Boolean)
        .join(" · ")
  };
}

function getSeasonSportLabel(sportType) {
  const labels = {
    triathlon: "Triathlon",
    ultra: "Trail / Ultra",
    cycling: "Cycling",
    swimming: "Swimming",
    running: "Running"
  };

  return labels[sportType] || "Event";
}

function getSeasonAutomaticEquipmentGroups(event) {
  const context =
    getSeasonEquipmentPresetContext(event);

  if (!context.hasAutoPreset) {
    return {
      context,
      groups: []
    };
  }

  if (context.sportType === "triathlon") {
    return {
      context,
      groups: [
        {
          title: "Schwimmen",
          items: [
            "Neoprenanzug",
            "Schwimmbrille",
            "Badekappe"
          ]
        },
        {
          title: "Rad",
          items: [
            "Fahrrad",
            "Helm",
            "Radschuhe",
            "Trinkflaschen",
            "Reparaturset"
          ]
        },
        {
          title: "Laufen",
          items: [
            "Laufschuhe",
            "Startnummernband",
            "Socken",
            "Cap oder Visor"
          ]
        },
        {
          title: "Wechselzone / Sonstiges",
          items: [
            "Handtuch",
            "Sonnencreme",
            "Wechselbeutel"
          ]
        }
      ]
    };
  }

  if (context.sportType === "ultra") {
    return {
      context,
      groups: [
        {
          title: "Trail / Ultra",
          items: [
            "Trail-Schuhe",
            "Laufrucksack",
            "Pflichtausrüstung",
            "Softflasks",
            "Stirnlampe",
            "Rettungsdecke",
            "Regenjacke"
          ]
        },
        {
          title: "Allgemein",
          items: [
            "Socken",
            "Wettkampfkleidung",
            "Uhr",
            "Cap oder Visor",
            "Wechselkleidung"
          ]
        }
      ]
    };
  }

  if (context.sportType === "cycling") {
    return {
      context,
      groups: [
        {
          title: "Rad",
          items: [
            "Fahrrad",
            "Helm",
            "Radschuhe",
            "Trinkflaschen",
            "Reparaturset",
            "Sonnenbrille"
          ]
        }
      ]
    };
  }

  if (context.sportType === "swimming") {
    return {
      context,
      groups: [
        {
          title: "Schwimmen",
          items: [
            "Schwimmbrille",
            "Badekappe",
            "Handtuch",
            "Neoprenanzug"
          ]
        }
      ]
    };
  }

  return {
    context,
    groups: [
      {
        title: "Laufen",
        items: [
          "Schuhe",
          "Socken",
          "Wettkampfkleidung",
          "Startnummernband",
          "Uhr",
          "Cap oder Visor",
          "Sonnenbrille",
          "Wechselkleidung"
        ]
      }
    ]
  };
}

function getSeasonEquipmentGroupItems(groups = []) {
  return groups
    .flatMap(group => group.items || [])
    .map(cleanValue)
    .filter(Boolean);
}

function isSeasonEquipmentItemChecked(checked, item) {
  return Boolean(
    checked[item] ||
    checked[cleanValue(item)]
  );
}

function renderSeasonEquipmentItem(item, eventKey, checked) {
  return `
    <label
      class="season-equipment-item"
      data-season-equipment-row="${escapeHTML(item)}"
    >
      <input
        type="checkbox"
        data-season-equipment-check="${escapeHTML(item)}"
        data-season-equipment-event="${escapeHTML(eventKey)}"
        ${isSeasonEquipmentItemChecked(checked, item) ? "checked" : ""}
      />
      <span>${escapeHTML(item)}</span>
      <button
        type="button"
        data-season-equipment-delete="${escapeHTML(item)}"
        data-season-equipment-event="${escapeHTML(eventKey)}"
        aria-label="Equipmentpunkt entfernen: ${escapeHTML(item)}"
      >
        ×
      </button>
    </label>
  `;
}

function renderSeasonEquipmentChecklist(event, eventKey, equipment = {}) {
  const status =
    normalizeSeasonAreaStatus(equipment.status);
  const checked =
    isPlainPlannerObject(equipment.checked)
      ? equipment.checked
      : {};
  const customItems =
    Array.isArray(equipment.items)
      ? equipment.items
      : [];
  const removedItems =
    Array.isArray(equipment.removed)
      ? equipment.removed.map(cleanValue)
      : [];
  const oldTemplateItems =
    equipment.template && !customItems.length
      ? getSeasonEquipmentTemplateItems(event, equipment.template)
      : [];
  const savedItems =
    [...new Set([...oldTemplateItems, ...customItems].map(cleanValue).filter(Boolean))];
  const preset =
    getSeasonAutomaticEquipmentGroups(event);
  const presetItems =
    getSeasonEquipmentGroupItems(preset.groups);
  const customOnlyItems =
    savedItems.filter(item =>
      !presetItems.includes(item) &&
      !removedItems.includes(item)
    );
  const visibleGroups =
    preset.groups
      .map(group => ({
        ...group,
        items:
          (group.items || [])
            .map(cleanValue)
            .filter(Boolean)
            .filter(item => !removedItems.includes(item))
      }))
      .filter(group => group.items.length);
  const hasEquipmentItems =
    visibleGroups.length ||
    customOnlyItems.length;

  return `
    <div
      class="season-equipment-panel"
      data-season-equipment-panel="${escapeHTML(eventKey)}"
    >
      <div class="season-status-strip">
        ${renderSeasonStatusSelect({ eventKey, path: "equipment.status", label: "Equipment", value: status, doneLabel: "Geplant" })}
      </div>
      ${status === "not_needed" ? `
        <div class="season-empty-detail" data-season-equipment-not-needed="${escapeHTML(eventKey)}">
          <strong>Equipment ist für dieses Event als nicht benötigt markiert.</strong>
          <span>Du kannst den Bereich jederzeit wieder auf Offen oder Geplant stellen und eigene Punkte ergänzen.</span>
        </div>
      ` : `
        ${preset.context.hasAutoPreset ? `
          <p class="season-equipment-source">
            Automatisch aus Eventdaten:
            <strong>${escapeHTML(preset.context.sourceLabel || getSeasonSportLabel(preset.context.sportType))}</strong>
          </p>
        ` : `
          <div class="season-empty-detail">
            <strong>Für dieses Event konnte keine automatische Equipment-Liste erstellt werden.</strong>
            <span>Du kannst weiterhin eigene Equipmentpunkte hinzufügen.</span>
          </div>
        `}
        <div
          class="season-equipment-groups"
          data-season-equipment-groups="${escapeHTML(eventKey)}"
        >
          ${visibleGroups.map(group => `
            <section class="season-equipment-group">
              <h4>${escapeHTML(group.title)}</h4>
              <div class="season-equipment-list">
                ${group.items.map(item =>
                  renderSeasonEquipmentItem(item, eventKey, checked)
                ).join("")}
              </div>
            </section>
          `).join("")}
          ${customOnlyItems.length ? `
            <section
              class="season-equipment-group season-equipment-custom-group"
              data-season-equipment-custom-group="${escapeHTML(eventKey)}"
            >
              <h4>Persönliche Ergänzungen</h4>
              <div
                class="season-equipment-list"
                data-season-equipment-custom-list="${escapeHTML(eventKey)}"
              >
                ${customOnlyItems.map(item =>
                  renderSeasonEquipmentItem(item, eventKey, checked)
                ).join("")}
              </div>
            </section>
          ` : ""}
          ${!hasEquipmentItems ? `
            <div class="season-empty-detail" data-season-equipment-empty="${escapeHTML(eventKey)}">
              <strong>Noch keine Ausrüstung geplant.</strong>
              <span>Füge einen eigenen Punkt hinzu.</span>
            </div>
          ` : ""}
        </div>
      `}
      <div class="season-inline-add">
        <input
          type="text"
          data-season-equipment-input="${escapeHTML(eventKey)}"
          data-testid="planner-equipment-input"
          placeholder="Eigenen Equipmentpunkt hinzufügen"
        />
        <button type="button" data-season-equipment-add="${escapeHTML(eventKey)}" data-testid="planner-equipment-add">Hinzufügen</button>
      </div>
    </div>
  `;
}

function querySeasonElements(scope, selector) {
  const root =
    scope || document;
  const matches =
    [];

  if (
    typeof Element !== "undefined" &&
    root instanceof Element &&
    root.matches(selector)
  ) {
    matches.push(root);
  }

  return [
    ...matches,
    ...Array.from(root.querySelectorAll(selector))
  ];
}

function updateSeasonEquipmentStatusControl(eventKey, value = "planned") {
  const statusSelect =
    document.querySelector(
      `[data-season-detail-event="${CSS.escape(eventKey)}"][data-season-detail-field="equipment.status"]`
    );

  if (statusSelect) {
    statusSelect.value =
      value;
  }
}

function ensureSeasonEquipmentCustomList(eventKey) {
  const panel =
    document.querySelector(
      `[data-season-equipment-panel="${CSS.escape(eventKey)}"]`
    );

  if (!panel) {
    return null;
  }

  let groups =
    panel.querySelector(
      `[data-season-equipment-groups="${CSS.escape(eventKey)}"]`
    );

  if (!groups) {
    groups =
      document.createElement("div");
    groups.className =
      "season-equipment-groups";
    groups.dataset.seasonEquipmentGroups =
      eventKey;

    const addRow =
      panel.querySelector(".season-inline-add");

    panel.insertBefore(groups, addRow || null);
  }

  let list =
    groups.querySelector(
      `[data-season-equipment-custom-list="${CSS.escape(eventKey)}"]`
    );

  if (!list) {
    const group =
      document.createElement("section");

    group.className =
      "season-equipment-group season-equipment-custom-group";
    group.dataset.seasonEquipmentCustomGroup =
      eventKey;
    group.innerHTML = `
      <h4>Persönliche Ergänzungen</h4>
      <div
        class="season-equipment-list"
        data-season-equipment-custom-list="${escapeHTML(eventKey)}"
      ></div>
    `;
    groups.appendChild(group);
    list =
      group.querySelector(
        `[data-season-equipment-custom-list="${CSS.escape(eventKey)}"]`
      );
  }

  groups
    .querySelector(
      `[data-season-equipment-empty="${CSS.escape(eventKey)}"]`
    )
    ?.remove();

  panel
    .querySelector(
      `[data-season-equipment-not-needed="${CSS.escape(eventKey)}"]`
    )
    ?.remove();

  return list;
}

function appendSeasonEquipmentCustomItem(eventKey, item, checked = {}) {
  const list =
    ensureSeasonEquipmentCustomList(eventKey);

  if (!list) {
    return;
  }

  const panel =
    list.closest("[data-season-equipment-panel]");
  const exists =
    Array.from(
      panel.querySelectorAll("[data-season-equipment-row]")
    ).some(row =>
      cleanValue(row.dataset.seasonEquipmentRow)
        .toLowerCase() === cleanValue(item).toLowerCase()
    );

  if (exists) {
    return;
  }

  const template =
    document.createElement("template");

  template.innerHTML =
    renderSeasonEquipmentItem(item, eventKey, checked).trim();

  const row =
    template.content.firstElementChild;

  if (!row) {
    return;
  }

  list.appendChild(row);
  bindSeasonEquipmentInteractions(row);
}

function bindSeasonEquipmentInteractions(scope = document) {
  querySeasonElements(
    scope,
    "[data-season-equipment-input]"
  ).forEach(input => {
    if (input.dataset.seasonEquipmentBound) {
      return;
    }

    input.dataset.seasonEquipmentBound =
      "true";

    ["click", "focus", "mousedown"].forEach(eventName => {
      input.addEventListener(eventName, event => {
        event.stopPropagation();
      });
    });

    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      document
        .querySelector(
          `[data-season-equipment-add="${CSS.escape(input.dataset.seasonEquipmentInput)}"]`
        )
        ?.click();
    });
  });

  querySeasonElements(
    scope,
    "[data-season-equipment-check]"
  ).forEach(input => {
    if (input.dataset.seasonEquipmentBound) {
      return;
    }

    input.dataset.seasonEquipmentBound =
      "true";

    input.addEventListener("click", event => {
      event.stopPropagation();
    });

    input.addEventListener("change", event => {
      event.stopPropagation();

      const eventKey =
        input.dataset.seasonEquipmentEvent;
      const details =
        getSeasonPlannerDetails(eventKey);
      const equipment =
        normalizePlannerDetails(details).equipment;
      const item =
        input.dataset.seasonEquipmentCheck;

      setSeasonPlannerDetailField(
        eventKey,
        "equipment",
        {
          ...equipment,
          status: "planned",
          checked: {
            ...(equipment.checked || {}),
            [item]: input.checked
          }
        }
      );
      updateSeasonEquipmentStatusControl(eventKey);
    });
  });

  querySeasonElements(
    scope,
    "[data-season-equipment-add]"
  ).forEach(button => {
    if (button.dataset.seasonEquipmentBound) {
      return;
    }

    button.dataset.seasonEquipmentBound =
      "true";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const eventKey =
        button.dataset.seasonEquipmentAdd;
      const input =
        document.querySelector(
          `[data-season-equipment-input="${CSS.escape(eventKey)}"]`
        );
      const item =
        cleanValue(input?.value);

      if (!item) {
        input?.focus();
        return;
      }

      const details =
        getSeasonPlannerDetails(eventKey);
      const equipment =
        normalizePlannerDetails(details).equipment;

      setSeasonPlannerDetailField(
        eventKey,
        "equipment",
        {
          ...equipment,
          status: "planned",
          removed:
            (equipment.removed || []).filter(value =>
              cleanValue(value).toLowerCase() !== item.toLowerCase()
            ),
          items:
            [
              ...new Set([
                ...(equipment.items || []),
                item
              ].map(cleanValue).filter(Boolean))
            ]
        }
      );

      appendSeasonEquipmentCustomItem(
        eventKey,
        item,
        equipment.checked || {}
      );
      updateSeasonEquipmentStatusControl(eventKey);

      if (input) {
        input.value =
          "";
        input.focus();
      }
    });
  });

  querySeasonElements(
    scope,
    "[data-season-equipment-delete]"
  ).forEach(button => {
    if (button.dataset.seasonEquipmentBound) {
      return;
    }

    button.dataset.seasonEquipmentBound =
      "true";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const eventKey =
        button.dataset.seasonEquipmentEvent;
      const item =
        button.dataset.seasonEquipmentDelete;
      const details =
        getSeasonPlannerDetails(eventKey);
      const equipment =
        normalizePlannerDetails(details).equipment;
      const checked =
        { ...(equipment.checked || {}) };

      delete checked[item];

      setSeasonPlannerDetailField(
        eventKey,
        "equipment",
        {
          ...equipment,
          checked,
          items:
            (equipment.items || []).filter(value =>
              cleanValue(value).toLowerCase() !== cleanValue(item).toLowerCase()
            ),
          removed:
            [
              ...new Set([
                ...(equipment.removed || []),
                item
              ].map(cleanValue).filter(Boolean))
            ]
        }
      );

      const row =
        button.closest(".season-equipment-item");
      const group =
        row?.closest(".season-equipment-group");

      row?.remove();

      if (
        group?.classList.contains("season-equipment-custom-group") &&
        !group.querySelector(".season-equipment-item")
      ) {
        group.remove();
      }

      updateSeasonEquipmentStatusControl(eventKey);
    });
  });
}

function bindSeasonDetailPanelState() {
  document
    .querySelectorAll("[data-season-detail-panel]")
    .forEach(panel => {
      const panelKey =
        panel.dataset.seasonDetailPanel;

      if (!panelKey || panel.dataset.seasonPanelBound) {
        return;
      }

      panel.dataset.seasonPanelBound =
        "true";

      panel.addEventListener("toggle", () => {
        panel
          .querySelector(":scope > summary")
          ?.setAttribute(
            "aria-expanded",
            panel.open ? "true" : "false"
          );

        if (panel.open) {
          seasonOpenDetailPanels.add(panelKey);
        } else {
          seasonOpenDetailPanels.delete(panelKey);
        }
      });

      if (panelKey.startsWith("equipment:")) {
        const summary =
          panel.querySelector("summary");

        summary?.addEventListener("click", event => {
          if (event.detail === 0) {
            return;
          }

          const rect =
            summary.getBoundingClientRect();
          const isToggleZone =
            event.clientX >= rect.right - 52;

          if (!isToggleZone) {
            event.preventDefault();
          }
        });
      }
    });
}

function renderSeasonNutritionPlanner(eventKey, nutrition = {}) {
  const status =
    normalizeSeasonAreaStatus(nutrition.status);
  const entries =
    Array.isArray(nutrition.entries)
      ? nutrition.entries
      : [];
  const type =
    cleanValue(nutrition.type);
  const timingMode =
    cleanValue(nutrition.timing_mode) || "distance";

  return `
    <div class="season-nutrition-panel">
      <div class="season-detail-fields">
        ${renderSeasonStatusSelect({ eventKey, path: "nutrition.status", label: "Verpflegung", value: status, doneLabel: "Geplant" })}
        <label class="season-detail-field">
          <span>Grundplan</span>
          <select data-season-detail-event="${escapeHTML(eventKey)}" data-season-detail-field="nutrition.type">
            ${[
              ["", "Noch nicht gewählt"],
              ["not_needed", "Nicht benötigt"],
              ["water", "Nur Wasser"],
              ["own", "Eigene Verpflegung"],
              ["organizer", "Verpflegung des Veranstalters"],
              ["mixed", "Kombination"]
            ].map(([value, label]) => `
              <option value="${escapeHTML(value)}" ${type === value ? "selected" : ""}>${escapeHTML(label)}</option>
            `).join("")}
          </select>
        </label>
        <label class="season-detail-field">
          <span>Planung nach</span>
          <select data-season-detail-event="${escapeHTML(eventKey)}" data-season-detail-field="nutrition.timing_mode">
            ${[
              ["clock", "Uhrzeit"],
              ["race_time", "Rennzeit"],
              ["distance", "Distanz"],
              ["course_point", "Streckenpunkt"]
            ].map(([value, label]) => `
              <option value="${escapeHTML(value)}" ${timingMode === value ? "selected" : ""}>${escapeHTML(label)}</option>
            `).join("")}
          </select>
        </label>
      </div>
      ${status === "not_needed" || type === "not_needed" ? `
        <div class="season-empty-detail">
          <strong>Keine Verpflegung während des Rennens nötig.</strong>
          <span>Das blockiert deinen Planungsstatus nicht.</span>
        </div>
      ` : `
        <div class="season-nutrition-list">
          ${entries.map((entry, index) => `
            <div class="season-nutrition-entry">
              <strong>${escapeHTML(entry.stage || "Während des Rennens")}</strong>
              <span>${escapeHTML([entry.trigger, entry.product, entry.amount, entry.fluid].filter(Boolean).join(" · ") || "Noch unvollständig")}</span>
              ${entry.note ? `<em>${escapeHTML(entry.note)}</em>` : ""}
              <button
                type="button"
                data-season-nutrition-delete="${index}"
                data-season-nutrition-event="${escapeHTML(eventKey)}"
                aria-label="Verpflegungseintrag entfernen"
              >
                ×
              </button>
            </div>
          `).join("") || `
            <div class="season-empty-detail">
              <strong>Für dieses Event wurde noch kein Verpflegungsplan erstellt.</strong>
              <span>Für kurze Rennen kannst du „Nur Wasser“ oder „Nicht benötigt“ wählen.</span>
            </div>
          `}
        </div>
        <div class="season-nutrition-add" data-season-nutrition-form="${escapeHTML(eventKey)}">
          <select data-season-nutrition-stage data-testid="planner-nutrition-stage">
            <option value="Vor dem Start">Vor dem Start</option>
            <option value="Während des Rennens">Während des Rennens</option>
            <option value="Nach dem Rennen">Nach dem Rennen</option>
          </select>
          <input type="text" data-season-nutrition-trigger data-testid="planner-nutrition-trigger" placeholder="km 10, 40 min, Station 3" />
          <input type="text" data-season-nutrition-product data-testid="planner-nutrition-product" placeholder="Gel, Wasser, Drink..." />
          <input type="text" data-season-nutrition-amount data-testid="planner-nutrition-amount" placeholder="Menge" />
          <input type="text" data-season-nutrition-fluid data-testid="planner-nutrition-fluid" placeholder="Flüssigkeit" />
          <input type="text" data-season-nutrition-note data-testid="planner-nutrition-note" placeholder="Hinweis" />
          <button type="button" data-season-nutrition-add="${escapeHTML(eventKey)}" data-testid="planner-nutrition-add">Eintrag hinzufügen</button>
        </div>
      `}
    </div>
  `;
}

function renderSeasonTimeInput({
  eventKey,
  path,
  labelKey,
  fallback,
  value = ""
}) {
  const parts =
    getSeasonDurationParts(value);

  return `
    <fieldset class="season-time-input">
      <legend>${escapeHTML(seasonPlannerText(labelKey, fallback))}</legend>
      ${[
        ["hours", "season.hoursShort", "h", parts.hours],
        ["minutes", "season.minutesShort", "min", parts.minutes],
        ["seconds", "season.secondsShort", "sec", parts.seconds]
      ].map(([part, key, fallbackLabel, partValue]) => `
        <label>
          <span>${escapeHTML(seasonPlannerText(key, fallbackLabel))}</span>
          <input
            type="number"
            inputmode="numeric"
            min="0"
            ${part === "hours" ? "max=\"99\"" : "max=\"59\""}
            step="1"
            data-season-time-part="${escapeHTML(part)}"
            data-season-time-event="${escapeHTML(eventKey)}"
            data-season-time-field="${escapeHTML(path)}"
            data-testid="planner-time-${escapeHTML(cleanValue(path).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase())}-${escapeHTML(part)}"
            value="${escapeHTML(partValue)}"
            placeholder="${part === "hours" ? "0" : "00"}"
          />
        </label>
      `).join("")}
    </fieldset>
  `;
}

function renderSeasonCalculatedMetric(labelKey, fallback, value) {
  if (!cleanValue(value)) {
    return "";
  }

  return `
    <span>
      <em>${escapeHTML(seasonPlannerText(labelKey, fallback))}</em>
      <strong>${escapeHTML(value)}</strong>
    </span>
  `;
}

function renderSeasonDistancePresetControl(event, eventKey, result) {
  const selectedPreset =
    result.distance_preset ||
    result.distance_source ||
    "official";
  const options =
    getSeasonDistancePresetOptions(event);

  return `
    <label class="season-detail-field season-detail-field-wide">
      <span>${escapeHTML(seasonPlannerText("season.resultDistance", "Result distance"))}</span>
      <select
        data-season-detail-event="${escapeHTML(eventKey)}"
        data-season-detail-field="result.distance_preset"
      >
        ${options.map(option => `
          <option
            value="${escapeHTML(option.value)}"
            ${selectedPreset === option.value ? "selected" : ""}
          >
            ${escapeHTML(option.label)}
          </option>
        `).join("")}
      </select>
    </label>
    <label class="season-detail-field ${selectedPreset === "custom" ? "" : "season-detail-field-muted"}">
      <span>${escapeHTML(seasonPlannerText("season.customDistanceKm", "Custom distance km"))}</span>
      <input
        type="number"
        inputmode="decimal"
        min="0"
        step="0.01"
        data-season-detail-event="${escapeHTML(eventKey)}"
        data-season-detail-field="result.custom_distance_km"
        value="${escapeHTML(result.custom_distance_km || "")}"
        placeholder="42.20"
      />
    </label>
  `;
}

function getSeasonFinishStatusLabel(status) {
  const labels = {
    Finished: "Finished",
    Finisher: seasonPlannerText("season.statusFinisher", "Finisher"),
    DNF: "DNF",
    DNS: "DNS",
    DSQ: "DSQ",
    Cancelled: seasonPlannerText("season.statusCancelled", "Cancelled"),
    Other: seasonPlannerText("season.statusOther", "Other")
  };

  return labels[status] || seasonPlannerText("season.selectStatus", "Select status");
}

function renderSeasonDashboardMetric(label, value, options = {}) {
  if (!cleanValue(value) && !options.allowEmpty) {
    return "";
  }

  return `
    <span class="season-race-metric ${options.tone ? `season-race-metric-${escapeHTML(options.tone)}` : ""}">
      <em>${escapeHTML(label)}</em>
      <strong>${escapeHTML(value || options.empty || "-")}</strong>
    </span>
  `;
}

function renderSeasonStatusChip(label, isDone) {
  return `
    <span class="season-status-chip ${isDone ? "is-done" : "is-open"}">
      <b aria-hidden="true">${isDone ? "✓" : "○"}</b>
      ${escapeHTML(label)}
    </span>
  `;
}

function renderSeasonCompactPreview(label, value, emptyText) {
  return `
    <div class="season-compact-preview">
      <span>${escapeHTML(label)}</span>
      <p>${escapeHTML(cleanValue(value) || emptyText)}</p>
    </div>
  `;
}

function getSeasonDaysUntil(event) {
  const diff =
    getSeasonDayDifferenceFromToday(event?.date);

  if (diff === null) {
    return null;
  }

  return diff;
}

function getSeasonTrainingPhase(event) {
  const daysUntil =
    getSeasonDaysUntil(event);

  if (daysUntil === null) {
    return "Planung";
  }

  if (daysUntil < 0) {
    return "Recovery";
  }

  if (daysUntil <= 7) {
    return "Race Week";
  }

  if (daysUntil <= 21) {
    return "Taper";
  }

  if (daysUntil <= 56) {
    return "Peak Phase";
  }

  if (daysUntil <= 112) {
    return "Build Phase";
  }

  return "Base Phase";
}

function getSeasonPlanningAreas(event, details = {}) {
  const goals =
    details.goals || {};
  const logistics =
    details.logistics || {};
  const equipment =
    details.equipment || {};
  const nutrition =
    details.nutrition || {};
  const result =
    details.result || {};
  const note =
    cleanValue(details.personal_note || getSeasonNote(event));
  const isPast =
    isSeasonEventPast(event);

  if (isPast) {
    return getSeasonPostRaceReviewAreas(details);
  }

  const goalType =
    cleanValue(goals.goal_type);
  const travelStatus =
    getSeasonAreaStatus(
      details,
      "logistics.travel_status",
      Boolean(logistics.travel_booked || cleanValue(logistics.travel_note))
    );
  const accommodationStatus =
    getSeasonAreaStatus(
      details,
      "logistics.accommodation_status",
      Boolean(logistics.accommodation_booked)
    );
  const bibStatus =
    getSeasonAreaStatus(
      details,
      "logistics.bib_status",
      Boolean(cleanValue(logistics.bib_number))
    );
  const goalStatus =
    getSeasonAreaStatus(
      details,
      "goals.goal_status",
      Boolean(goalType || cleanValue(goals.target_description) || cleanValue(goals.target_time))
    );
  const strategyStatus =
    getSeasonAreaStatus(
      details,
      "goals.strategy_status",
      Boolean(cleanValue(goals.target_description))
    );
  const notesStatus =
    getSeasonAreaStatus(
      details,
      "goals.notes_status",
      Boolean(note)
    );
  const equipmentStatus =
    getSeasonAreaStatus(
      details,
      "equipment.status",
      false
    );
  const nutritionStatus =
    getSeasonAreaStatus(
      details,
      "nutrition.status",
      false
    );
  const hasDistance =
    Boolean(
      cleanValue(getSeasonPlannedDistance(event)) ||
      cleanValue(getSeasonDisplayDistance(event))
    );
  const hasResult =
    Boolean(
      cleanValue(result.finish_status) ||
      cleanValue(result.finish_time) ||
      cleanValue(result.race_report)
    );
  const makeArea = ({
    key,
    label,
    status = "open",
    done = false,
    next = "",
    important = false
  }) => {
    const normalized =
      normalizeSeasonAreaStatus(
        status,
        done ? "done" : "open"
      );

    return {
      key,
      label,
      status: normalized,
      done:
        normalized === "done" ||
        normalized === "planned" ||
        Boolean(done),
      notNeeded:
        normalized === "not_needed",
      next,
      important
    };
  };

  return [
    makeArea({
      key: "date",
      label: "Datum",
      done: Boolean(parseSeasonDate(event.date)),
      next: "Eventdatum prüfen",
      important: true
    }),
    makeArea({
      key: "distance",
      label: "Distanz",
      done: hasDistance,
      next: "Distanz auswählen",
      important: true
    }),
    makeArea({
      key: "priority",
      label: "Priorität",
      done: getSeasonPriority(event) !== "Maybe",
      next: "Race-Priorität setzen",
      important: true
    }),
    makeArea({
      key: "goal",
      label: "Ziel",
      status: goalStatus,
      done:
        goalStatus === "not_needed" ||
        Boolean(goalType || cleanValue(goals.target_description) || cleanValue(goals.target_time)),
      next: "Eventziel auswählen",
      important: true
    }),
    makeArea({
      key: "registration",
      label: "Anmeldung",
      done: Boolean(logistics.registration_confirmed),
      next: "Anmeldung prüfen",
      important: true
    }),
    makeArea({
      key: "travel",
      label: "Reise",
      status: travelStatus,
      done:
        travelStatus === "not_needed" ||
        travelStatus === "done" ||
        Boolean(logistics.travel_booked || cleanValue(logistics.travel_note)),
      next: "Anreise planen"
    }),
    makeArea({
      key: "accommodation",
      label: "Unterkunft",
      status: accommodationStatus,
      done:
        accommodationStatus === "not_needed" ||
        accommodationStatus === "done" ||
        Boolean(logistics.accommodation_booked),
      next: "Unterkunft planen"
    }),
    makeArea({
      key: "bib",
      label: "Startunterlagen",
      status: bibStatus,
      done:
        bibStatus === "not_needed" ||
        bibStatus === "done" ||
        Boolean(cleanValue(logistics.bib_number)),
      next: "Startunterlagen prüfen",
      important: true
    }),
    makeArea({
      key: "strategy",
      label: "Race Strategy",
      status: strategyStatus,
      done:
        strategyStatus === "not_needed" ||
        strategyStatus === "done" ||
        Boolean(cleanValue(goals.target_description) || cleanValue(goals.target_pace)),
      next: "Race-Strategie notieren"
    }),
    makeArea({
      key: "equipment",
      label: "Equipment",
      status: equipmentStatus,
      done:
        equipmentStatus === "not_needed" ||
        equipmentStatus === "done" ||
        equipmentStatus === "planned",
      next: "Equipment planen"
    }),
    makeArea({
      key: "nutrition",
      label: "Verpflegung",
      status: nutritionStatus,
      done:
        nutritionStatus === "not_needed" ||
        nutritionStatus === "done" ||
        nutritionStatus === "planned" ||
        cleanValue(details.nutrition?.type) === "not_needed",
      next: "Verpflegung klären"
    }),
    makeArea({
      key: "notes",
      label: "Notizen",
      status: notesStatus,
      done:
        notesStatus === "not_needed" ||
        notesStatus === "done" ||
        Boolean(note),
      next: "Persönliche Notiz hinzufügen"
    }),
    makeArea({
      key: "result",
      label: "Ergebnis",
      done: !isPast || hasResult,
      next: "Ergebnis eintragen",
      important: isPast
    })
  ];
}

function getSeasonPreparationSummary(event, details = {}) {
  const areas =
    getSeasonPlanningAreas(event, details);
  const relevantAreas =
    areas.filter(area => !area.notNeeded);
  const importantOpen =
    relevantAreas.filter(area =>
      area.important &&
      !area.done
    );
  const openAreas =
    relevantAreas.filter(area => !area.done);
  const complete =
    relevantAreas.filter(area => area.done).length;
  const total =
    relevantAreas.length;
  const percent =
    total
      ? Math.round((complete / total) * 100)
      : 0;
  const nextOpen =
    importantOpen[0] ||
    openAreas[0];
  const isPast =
    isSeasonEventPast(event);
  let status =
    "Neu";

  if (isPast) {
    status =
      getSeasonPostRaceStatus(details);
  } else if (!openAreas.length || !importantOpen.length) {
    status = "Bereit";
  } else if (importantOpen.length <= 1 && openAreas.length <= 3) {
    status = "Fast bereit";
  } else if (complete > 0) {
    status = "In Planung";
  }

  const openSummary =
    !openAreas.length
      ? isPast
        ? "Vollständig dokumentiert"
        : "Bereit für den Renntag"
      : openAreas.length === 1
        ? `${openAreas[0].label} noch offen`
        : `${openAreas.length} relevante Punkte offen`;

  return {
    areas,
    relevantAreas,
    complete,
    total,
    percent,
    status,
    openSummary,
    nextTask:
      isPast
        ? getSeasonPostRaceNextTask(details)
        : nextOpen?.next ||
          "Du bist bereit",
    missing:
      openAreas
  };
}

function renderSeasonChecklist(summary) {
  return `
    <div class="season-checklist-grid">
      ${summary.areas.map(area => `
        <span class="season-check-item ${area.notNeeded ? "is-neutral" : area.done ? "is-done" : "is-open"}">
          <b aria-hidden="true">${area.notNeeded ? "–" : area.done ? "✓" : "○"}</b>
          ${escapeHTML(area.label)}
        </span>
      `).join("")}
    </div>
  `;
}

function renderSeasonDetailPanel({
  title,
  summary,
  body,
  open = false,
  tone = "",
  panelKey = ""
}) {
  const testId =
    `planner-section-${cleanValue(title)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "detail"}`;
  const shouldOpen =
    open ||
    (panelKey && seasonOpenDetailPanels.has(panelKey));
  const panelId =
    `${testId}-${cleanValue(panelKey || title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "panel"}`;
  const bodyId = `${panelId}-content`;

  return `
    <details
      id="${escapeHTML(panelId)}"
      class="season-detail-panel ${tone ? `season-detail-panel-${escapeHTML(tone)}` : ""}"
      data-testid="${escapeHTML(testId)}"
      ${panelKey ? `data-season-detail-panel="${escapeHTML(panelKey)}"` : ""}
      ${shouldOpen ? "open" : ""}
    >
      <summary aria-expanded="${shouldOpen ? "true" : "false"}" aria-controls="${escapeHTML(bodyId)}">
        <span>
          <strong>${escapeHTML(title)}</strong>
          <em>${escapeHTML(summary)}</em>
        </span>
      </summary>
      <div id="${escapeHTML(bodyId)}" class="season-detail-panel-body">
        ${body}
      </div>
    </details>
  `;
}

function renderSeasonTimeField({
  eventKey,
  path,
  label,
  value
}) {
  return renderSeasonTimeInput({
    eventKey,
    path,
    labelKey: "",
    fallback: label,
    value
  });
}

function getSeasonResultSummaryItems(event, goals, result) {
  const sportType =
    getSeasonSportType(event);
  const distanceKm =
    Number(result.distanceKm);
  const targetSeconds =
    getSeasonNumericSeconds(goals.targetTimeSeconds);
  const finishSeconds =
    getSeasonNumericSeconds(result.finishTimeSeconds);
  const targetMetric =
    getSeasonPerformanceMetric({
      event,
      seconds: targetSeconds,
      distanceKm
    });
  const finishMetric =
    getSeasonPerformanceMetric({
      event,
      seconds: finishSeconds,
      distanceKm
    });
  const goalDelta =
    result.goalDeltaSeconds === null ||
    result.goalDeltaSeconds === undefined ||
    cleanValue(result.goalDeltaSeconds) === ""
      ? ""
      : formatSeasonGoalDelta(Number(result.goalDeltaSeconds));

  return {
    sportType,
    distanceKm,
    targetMetric,
    finishMetric,
    goalDelta
  };
}

function renderSeasonSplitInputs(eventKey, result) {
  return `
    <div class="season-tri-split-grid">
      ${renderSeasonTimeField({ eventKey, path: "result.swim_split", label: "Swim split", value: result.swim_split })}
      ${renderSeasonTimeField({ eventKey, path: "result.t1", label: "T1", value: result.t1 })}
      ${renderSeasonTimeField({ eventKey, path: "result.bike_split", label: "Bike split", value: result.bike_split })}
      ${renderSeasonTimeField({ eventKey, path: "result.t2", label: "T2", value: result.t2 })}
      ${renderSeasonTimeField({ eventKey, path: "result.run_split", label: "Run split", value: result.run_split })}
    </div>
  `;
}

function renderSeasonSplitSummary(result) {
  const splitItems = [
    ["Swim", result.swim_split],
    ["T1", result.t1],
    ["Bike", result.bike_split],
    ["T2", result.t2],
    ["Run", result.run_split]
  ].filter(([, value]) => cleanValue(value));

  if (!splitItems.length) {
    return "";
  }

  return `
    <div class="season-split-summary">
      ${splitItems.map(([label, value]) =>
        renderSeasonDashboardMetric(label, value)
      ).join("")}
    </div>
  `;
}

function renderSeasonRatingControl(eventKey, result) {
  const active =
    cleanValue(result.personal_rating);
  const ratings = [
    ["1", "1 - Sehr schlecht"],
    ["2", "2 - Eher schlecht"],
    ["3", "3 - Okay"],
    ["4", "4 - Gut"],
    ["5", "5 - Sehr gut"]
  ];

  return `
    <label class="season-detail-field">
      <span>${escapeHTML(seasonPlannerText("season.personalRating", "Persönliche Bewertung"))}</span>
      <select
        data-season-detail-event="${escapeHTML(eventKey)}"
        data-season-detail-field="result.personal_rating"
      >
        <option value="">Noch nicht bewertet</option>
        ${ratings.map(([value, label]) => `
          <option value="${value}" ${active === value ? "selected" : ""}>${escapeHTML(label)}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function hasSeasonResult(result = {}) {
  return Boolean(
    cleanValue(result.finish_time) ||
    cleanValue(result.finish_status) ||
    cleanValue(result.overall_place) ||
    cleanValue(result.gender_place) ||
    cleanValue(result.age_group_place) ||
    cleanValue(result.official_result_url) ||
    cleanValue(result.swim_split) ||
    cleanValue(result.bike_split) ||
    cleanValue(result.run_split) ||
    cleanValue(result.checkpoint_splits) ||
    cleanValue(result.dnf_time) ||
    cleanValue(result.dnf_distance) ||
    cleanValue(result.dnf_reason) ||
    cleanValue(result.dsq_reason)
  );
}

function hasSeasonReflection(result = {}) {
  return Boolean(
    cleanValue(result.race_report) ||
    cleanValue(result.went_well) ||
    cleanValue(result.what_was_difficult) ||
    cleanValue(result.next_time_change) ||
    cleanValue(result.nutrition_worked) ||
    cleanValue(result.equipment_worked) ||
    cleanValue(result.would_repeat) ||
    cleanValue(result.key_learnings)
  );
}

function hasSeasonSplits(result = {}) {
  return Boolean(
    cleanValue(result.swim_split) ||
    cleanValue(result.t1) ||
    cleanValue(result.bike_split) ||
    cleanValue(result.t2) ||
    cleanValue(result.run_split) ||
    cleanValue(result.checkpoint_splits)
  );
}

function isSeasonNonFinishStatus(status) {
  return ["DNS", "DNF", "DSQ"].includes(cleanValue(status));
}

function getSeasonPostRaceStatus(details = {}) {
  const result =
    details.result || {};
  const finishStatus =
    cleanValue(result.finish_status);

  if (isSeasonNonFinishStatus(finishStatus)) {
    return finishStatus;
  }

  if (!hasSeasonResult(result)) {
    return "Ergebnis ausstehend";
  }

  if (
    !hasSeasonReflection(result) ||
    !cleanValue(result.personal_rating)
  ) {
    return "Reflexion ausstehend";
  }

  return "Vollständig dokumentiert";
}

function getSeasonPostRaceNextTask(details = {}) {
  const result =
    details.result || {};
  const finishStatus =
    cleanValue(result.finish_status);

  if (
    isSeasonNonFinishStatus(finishStatus) &&
    !hasSeasonReflection(result)
  ) {
    return "Rennverlauf dokumentieren";
  }

  if (!hasSeasonResult(result)) {
    return "Ergebnis eintragen";
  }

  if (!hasSeasonReflection(result)) {
    return "Rennen kurz reflektieren";
  }

  return "Keine offenen Schritte";
}

function getSeasonPostRaceReviewAreas(details = {}) {
  const result =
    details.result || {};
  const finishStatus =
    cleanValue(result.finish_status);

  return [
    {
      key: "result",
      label: "Ergebnis",
      done: hasSeasonResult(result),
      next: "Ergebnis eintragen",
      important: true
    },
    {
      key: "finish_status",
      label: "Finish Status",
      done: Boolean(finishStatus),
      next: "Finish Status setzen",
      important: true
    },
    {
      key: "rating",
      label: "Bewertung",
      done: Boolean(cleanValue(result.personal_rating)),
      next: "Bewertung ergänzen"
    },
    {
      key: "reflection",
      label: "Reflexion",
      done: hasSeasonReflection(result),
      next:
        isSeasonNonFinishStatus(finishStatus)
          ? "Rennverlauf dokumentieren"
          : "Rennen kurz reflektieren",
      important: true
    },
    {
      key: "learnings",
      label: "Learnings",
      done: Boolean(cleanValue(result.key_learnings)),
      next: "Learnings ergänzen",
      optional: true
    },
    {
      key: "result_link",
      label: "Ergebnislink",
      done: Boolean(cleanValue(result.official_result_url)),
      next: "Ergebnislink ergänzen",
      optional: true
    },
    {
      key: "splits",
      label: "Splits",
      done: hasSeasonSplits(result),
      next: "Splits ergänzen",
      optional: true
    }
  ].map(area => ({
    ...area,
    status: area.done ? "done" : "open",
    notNeeded: Boolean(area.optional && !area.done)
  }));
}

function renderSeasonResultSummary(eventKey, event, result, goalDelta) {
  const officialUrl =
    cleanValue(result.official_result_url);

  return `
    <div class="season-result-summary-card">
      <div class="season-race-summary-grid">
        ${renderSeasonDashboardMetric("Finish Status", result.finish_status ? getSeasonFinishStatusLabel(result.finish_status) : "")}
        ${renderSeasonDashboardMetric("Finishzeit", result.finish_time)}
        ${renderSeasonDashboardMetric("Zielabweichung", goalDelta)}
        ${renderSeasonDashboardMetric("Overall", result.overall_place)}
        ${renderSeasonDashboardMetric("Gender", result.gender_place)}
        ${renderSeasonDashboardMetric("Age Group", result.age_group_place)}
        ${renderSeasonDashboardMetric("Bewertung", result.personal_rating ? `${result.personal_rating}/5` : "")}
      </div>
      ${renderSeasonSplitSummary(result)}
      <div class="season-result-actions">
        <button
          type="button"
          data-season-result-edit="${escapeHTML(eventKey)}"
        >
          Bearbeiten
        </button>
        ${officialUrl ? `
          <a href="${escapeHTML(safeUrl(officialUrl))}" target="_blank" rel="noopener noreferrer">
            Offizielles Ergebnis öffnen
          </a>
        ` : ""}
      </div>
    </div>
  `;
}

function renderSeasonResultForm(event, eventKey, result, summary, distanceLabel, finishMetricValue, goalDelta) {
  const sportType =
    summary.sportType;
  const activeStatus =
    cleanValue(result.finish_status);
  const statusOptions =
    ["", "Finished", "DNF", "DNS", "DSQ"];
  const fullStatusOptions =
    activeStatus && !statusOptions.includes(activeStatus)
      ? [...statusOptions, activeStatus]
      : statusOptions;
  const needsFinishTime =
    !["DNS", "DNF", "DSQ"].includes(activeStatus);
  const showDistance =
    sportType !== "triathlon";
  const showElevation =
    sportType === "cycling" ||
    sportType === "ultra";
  const showTriSplits =
    sportType === "triathlon";

  return `
    <div class="season-result-form">
      <section>
        <span class="season-subtitle">Grundlegendes Ergebnis</span>
        <div class="season-detail-fields">
          <label class="season-detail-field">
            <span>${escapeHTML(seasonPlannerText("season.finishStatus", "Finish status"))}</span>
            <select
              data-season-detail-event="${escapeHTML(eventKey)}"
              data-season-detail-field="result.finish_status"
              data-testid="planner-field-result-finish-status"
            >
              ${fullStatusOptions.map(status => `
                <option value="${escapeHTML(status)}" ${activeStatus === status ? "selected" : ""}>
                  ${escapeHTML(status ? getSeasonFinishStatusLabel(status) : seasonPlannerText("season.selectStatus", "Select status"))}
                </option>
              `).join("")}
            </select>
          </label>
          ${needsFinishTime ? renderSeasonTimeInput({ eventKey, path: "result.finish_time", labelKey: "season.finishTime", fallback: "Finishzeit", value: result.finish_time }) : ""}
          ${showDistance ? renderSeasonDistancePresetControl(event, eventKey, result) : ""}
          ${showElevation ? renderSeasonPlannerTextField({ eventKey, path: "result.elevation_gain_m", labelKey: "", fallback: "Höhenmeter", value: result.elevation_gain_m, placeholder: "850", type: "number" }) : ""}
          ${renderSeasonPlannerTextField({ eventKey, path: "result.official_result_url", labelKey: "season.officialResultUrl", fallback: "Offizielle Ergebnis-URL", value: result.official_result_url, placeholder: "https://..." })}
        </div>
        <div class="season-calculated-summary">
          ${renderSeasonCalculatedMetric("season.distanceKm", "Distanz", distanceLabel)}
          ${finishMetricValue ? renderSeasonCalculatedMetric("", sportType === "cycling" ? "Avg speed" : sportType === "swimming" ? "Pace / 100 m" : "Pace", finishMetricValue) : ""}
          ${renderSeasonCalculatedMetric("profile.goalDelta", "Zielabweichung", goalDelta)}
        </div>
      </section>
      ${activeStatus === "DNF" ? `
        <section>
          <span class="season-subtitle">DNF Details</span>
          <div class="season-detail-fields">
            ${renderSeasonTimeInput({ eventKey, path: "result.dnf_time", labelKey: "", fallback: "Abbruchzeit", value: result.dnf_time })}
            ${renderSeasonPlannerTextField({ eventKey, path: "result.dnf_distance", labelKey: "", fallback: "Abbruchdistanz", value: result.dnf_distance, placeholder: "km 18" })}
            ${renderSeasonPlannerTextarea({ eventKey, path: "result.dnf_reason", labelKey: "", fallback: "Grund", value: result.dnf_reason, placeholder: "Was war der Grund?" })}
          </div>
        </section>
      ` : ""}
      ${activeStatus === "DSQ" ? `
        <section>
          <span class="season-subtitle">DSQ Kommentar</span>
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.dsq_reason", labelKey: "", fallback: "Kommentar", value: result.dsq_reason, placeholder: "Grund oder Kommentar..." })}
        </section>
      ` : ""}
      ${showTriSplits ? `
        <section>
          <span class="season-subtitle">Splits</span>
          ${renderSeasonSplitInputs(eventKey, result)}
        </section>
      ` : ""}
      ${sportType === "ultra" ? `
        <section>
          <span class="season-subtitle">Checkpoint-Splits</span>
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.checkpoint_splits", labelKey: "", fallback: "Checkpoint-Splits", value: result.checkpoint_splits, placeholder: "CP1 00:42, CP2 01:35..." })}
        </section>
      ` : ""}
      <section>
        <span class="season-subtitle">Platzierung</span>
        <div class="season-detail-fields">
          ${renderSeasonPlannerTextField({ eventKey, path: "result.overall_place", labelKey: "season.overallPlace", fallback: "Gesamtplatz", value: result.overall_place, placeholder: "154", type: "number" })}
          ${renderSeasonPlannerTextField({ eventKey, path: "result.gender_place", labelKey: "season.genderPlace", fallback: "Gender-Platz", value: result.gender_place, placeholder: "42", type: "number" })}
          ${renderSeasonPlannerTextField({ eventKey, path: "result.age_group_place", labelKey: "season.ageGroupPlace", fallback: "Altersklassenplatz", value: result.age_group_place, placeholder: "8", type: "number" })}
          ${renderSeasonPlannerTextField({ eventKey, path: "result.category", labelKey: "season.resultCategory", fallback: "Kategorie", value: result.category, placeholder: "M35" })}
        </div>
      </section>
      <section>
        <span class="season-subtitle">Persönliche Reflexion</span>
        <div class="season-detail-fields">
          ${renderSeasonRatingControl(eventKey, result)}
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.went_well", labelKey: "", fallback: "Was lief gut?", value: result.went_well, placeholder: "Was möchtest du beibehalten?" })}
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.what_was_difficult", labelKey: "", fallback: "Was war schwierig?", value: result.what_was_difficult, placeholder: "Was hat Energie gekostet oder nicht funktioniert?" })}
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.next_time_change", labelKey: "", fallback: "Was nächstes Mal ändern?", value: result.next_time_change, placeholder: "Was würdest du anpassen?" })}
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.nutrition_worked", labelKey: "", fallback: "Verpflegung", value: result.nutrition_worked, placeholder: "Was hat bei der Verpflegung funktioniert?" })}
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.equipment_worked", labelKey: "", fallback: "Equipment", value: result.equipment_worked, placeholder: "Welches Equipment war gut oder problematisch?" })}
          ${renderSeasonPlannerTextField({ eventKey, path: "result.would_repeat", labelKey: "", fallback: "Wieder teilnehmen?", value: result.would_repeat, placeholder: "Ja, Nein, Vielleicht..." })}
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.key_learnings", labelKey: "", fallback: "Wichtigste Learnings", value: result.key_learnings, placeholder: "Was nimmst du für das nächste Event mit?" })}
          ${renderSeasonPlannerTextarea({ eventKey, path: "result.race_report", labelKey: "season.raceReport", fallback: "Rennbericht", value: result.race_report, placeholderKey: "season.raceReportPlaceholder", placeholder: "Wie lief das Rennen?" })}
        </div>
      </section>
      <div class="season-result-actions">
        <button type="button" data-season-result-close="${escapeHTML(eventKey)}">Ansicht speichern</button>
      </div>
    </div>
  `;
}

function renderSeasonResultPanel({
  event,
  eventKey,
  result,
  summary,
  distanceLabel,
  finishMetricValue,
  goalDelta,
  hasResult
}) {
  const isPast =
    isSeasonEventPast(event);
  const editMode =
    result.edit_mode === true ||
    result.edit_mode === "true";

  if (!isPast && !hasResult && !editMode) {
    return `
      <div class="season-empty-detail">
        <strong>Kann nach dem Event eingetragen werden.</strong>
        <span>Der Ergebnisbereich bleibt bis zum Race Day bewusst kompakt.</span>
      </div>
    `;
  }

  if (!editMode && hasResult) {
    return renderSeasonResultSummary(eventKey, event, result, goalDelta);
  }

  if (isPast && !editMode && !hasResult) {
    return `
      <div class="season-empty-detail">
        <strong>Wie lief dein Rennen?</strong>
        <span>Noch kein Ergebnis eingetragen.</span>
        <button type="button" data-season-result-edit="${escapeHTML(eventKey)}">Ergebnis eintragen</button>
      </div>
    `;
  }

  return renderSeasonResultForm(
    event,
    eventKey,
    result,
    summary,
    distanceLabel,
    finishMetricValue,
    goalDelta
  );
}

function getSeasonTimingLabel(event) {
  const daysUntil =
    getSeasonDaysUntil(event);

  if (daysUntil === null) {
    return "Kein Datum";
  }

  if (daysUntil < 0) {
    return `Vor ${Math.abs(daysUntil)} Tagen`;
  }

  if (daysUntil === 0) {
    return "Heute";
  }

  return `${daysUntil} Tage bis zum Rennen`;
}

function renderSeasonPostRaceReviewPanel(summary) {
  return `
    <div class="season-post-race-review">
      ${renderSeasonChecklist(summary)}
      <p class="season-guidance-copy">
        Nächster sinnvoller Schritt:
        <strong>${escapeHTML(summary.nextTask)}</strong>
      </p>
    </div>
  `;
}

function renderSeasonArchiveAction(eventKey, postRace = {}) {
  const archived =
    postRace.archived === true ||
    postRace.archived === "true";

  return `
    <button
      type="button"
      class="season-archive-action ${archived ? "is-archived" : ""}"
      data-season-archive="${escapeHTML(eventKey)}"
      data-season-archive-value="${archived ? "false" : "true"}"
      aria-pressed="${archived ? "true" : "false"}"
    >
      ${archived ? "Aus Archiv zurückholen" : "Im Archiv ablegen"}
    </button>
  `;
}

function renderSeasonPastPlanningPanels({
  event,
  eventKey,
  goals,
  logistics,
  equipment,
  nutrition,
  noteValue,
  goalNote,
  raceReport,
  targetMetricValue,
  resultMetricLabel,
  trainingPhase,
  daysLabel,
  raceLoad,
  goalSummaryCopy,
  logisticsSummaryCopy,
  equipmentSummaryCopy,
  nutritionSummaryCopy,
  notesSummaryCopy
}) {
  return renderSeasonDetailPanel({
    title: "Vorbereitung ansehen",
    summary: "Ziele, Logistik, Equipment und Notizen bleiben als Archiv erreichbar.",
    open: false,
    tone: "past-planning",
    body: `
      <div class="season-detail-panels season-past-planning-stack">
        ${renderSeasonDetailPanel({
          title: "Training",
          summary: `${trainingPhase} · ${daysLabel}`,
          body: `
            <div class="season-training-summary">
              ${renderSeasonDashboardMetric("Trainingsphase", trainingPhase, { allowEmpty: true })}
              ${renderSeasonDashboardMetric("Race Load", getSeasonPlanningLoadLabel(raceLoad.level), { allowEmpty: true })}
              ${renderSeasonDashboardMetric("Timing", daysLabel, { allowEmpty: true })}
            </div>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Ziel & Race Strategy",
          summary: goalSummaryCopy,
          body: `
            <div class="season-status-strip">
              ${renderSeasonStatusSelect({ eventKey, path: "goals.goal_status", label: "Ziel", value: goals.goal_status, doneLabel: "Geklärt" })}
              ${renderSeasonStatusSelect({ eventKey, path: "goals.strategy_status", label: "Race Strategy", value: goals.strategy_status, doneLabel: "Geplant" })}
            </div>
            ${renderSeasonGoalTypeControl(eventKey, goals)}
            ${renderSeasonGoalFields(eventKey, goals, targetMetricValue, resultMetricLabel)}
          `
        })}
        ${renderSeasonDetailPanel({
          title: seasonPlannerText("season.travelBooking", "Reise & Buchungen"),
          summary: logisticsSummaryCopy,
          body: `
            <div class="season-detail-checks season-detail-checks-compact">
              ${renderSeasonPlannerCheckbox({ eventKey, path: "logistics.registration_confirmed", labelKey: "season.registrationConfirmed", fallback: "Anmeldung bestätigt", checked: logistics.registration_confirmed })}
            </div>
            <div class="season-detail-fields">
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.travel_status", label: "Reise", value: logistics.travel_status || (logistics.travel_booked ? "done" : "open"), doneLabel: "Gebucht" })}
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.accommodation_status", label: "Unterkunft", value: logistics.accommodation_status || (logistics.accommodation_booked ? "done" : "open"), doneLabel: "Gebucht" })}
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.bib_status", label: "Startunterlagen", value: logistics.bib_status || (logistics.bib_number ? "done" : "open"), doneLabel: "Geklärt" })}
            </div>
            <div class="season-detail-fields season-detail-fields-compact">
              ${renderSeasonPlannerTextField({ eventKey, path: "logistics.bib_number", labelKey: "season.bibNumber", fallback: "Startnummer", value: logistics.bib_number, placeholder: "A1234" })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "logistics.travel_note", labelKey: "season.travelNote", fallback: "Reisenotiz", value: logistics.travel_note, placeholderKey: "season.travelNotePlaceholder", placeholder: "Hotel, Zug, Startbereich, Abholung..." })}
            </div>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Equipment",
          summary: equipmentSummaryCopy,
          tone: "equipment",
          panelKey: `equipment:${eventKey}`,
          body: renderSeasonEquipmentChecklist(event, eventKey, equipment)
        })}
        ${renderSeasonDetailPanel({
          title: "Verpflegung",
          summary: nutritionSummaryCopy,
          body: renderSeasonNutritionPlanner(eventKey, nutrition)
        })}
        ${renderSeasonDetailPanel({
          title: seasonPlannerText("season.personalNotes", "Notizen"),
          summary: notesSummaryCopy,
          body: `
            <div class="season-note-preview-grid">
              ${renderSeasonCompactPreview("Persönliche Notiz", noteValue, "Noch keine persönliche Notiz.")}
              ${renderSeasonCompactPreview("Zielnotiz", goalNote, "Noch keine Zielnotiz.")}
              ${renderSeasonCompactPreview("Rennbericht", raceReport, "Noch kein Rennbericht.")}
            </div>
            <div class="season-detail-fields">
              ${renderSeasonPlannerTextarea({
                eventKey,
                path: "personal_note",
                labelKey: "season.personalNote",
                fallback: "Persönliche Notiz",
                value: noteValue,
                placeholderKey: "season.personalNotePlaceholder",
                placeholder: "Training, Logistik, Fokus...",
                legacyNote: true
              })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "goals.target_description", labelKey: "season.targetDescription", fallback: "Zielnotiz", value: goals.target_description, placeholderKey: "season.goalPlaceholder", placeholder: "Ziel, Strategie, Pacings..." })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "result.race_report", labelKey: "season.raceReport", fallback: "Rennbericht", value: raceReport, placeholderKey: "season.raceReportPlaceholder", placeholder: "Wie lief das Rennen?" })}
            </div>
          `
        })}
      </div>
    `
  });
}

function renderSeasonPlannerDetails(event, eventKey) {
  const details =
    getSeasonPlannerDetailsForEvent(event);
  const goals =
    details.goals || {};
  const logistics =
    details.logistics || {};
  const equipment =
    details.equipment || {};
  const nutrition =
    details.nutrition || {};
  const postRace =
    details.post_race || {};
  const result =
    details.result || {};
  const isPast =
    isSeasonEventPast(event);
  const resultMuted =
    isPast
      ? ""
      : "is-future-result";
  const statusOptions =
    ["", "Finisher", "DNF", "DNS"];
  const activeStatus =
    cleanValue(result.finish_status);
  const fullStatusOptions =
    activeStatus && !statusOptions.includes(activeStatus)
      ? [...statusOptions, activeStatus]
      : statusOptions;
  const summary =
    getSeasonResultSummaryItems(event, goals, result);
  const distanceKm =
    summary.distanceKm;
  const distanceLabel =
    Number.isFinite(distanceKm)
      ? `${distanceKm.toFixed(distanceKm % 1 ? 2 : 0)} km`
      : "";
  const goalDelta =
    summary.goalDelta;
  const hasResult =
    hasSeasonResult(result);
  const logisticsDoneCount =
    [
      logistics.registration_confirmed,
      normalizeSeasonAreaStatus(logistics.travel_status, logistics.travel_booked ? "done" : "open") !== "open",
      normalizeSeasonAreaStatus(logistics.accommodation_status, logistics.accommodation_booked ? "done" : "open") !== "open"
    ].filter(Boolean).length;
  const resultMetricLabel =
    summary.sportType === "cycling"
      ? "Avg speed"
      : summary.sportType === "swimming"
        ? "Pace / 100 m"
        : "Pace";
  const targetMetricValue =
    summary.sportType === "triathlon"
      ? ""
      : summary.targetMetric.value;
  const finishMetricValue =
    summary.sportType === "triathlon"
      ? ""
      : summary.finishMetric.value;
  const noteValue =
    details.personal_note || getSeasonNote(event);
  const goalNote =
    cleanValue(goals.target_description);
  const raceReport =
    cleanValue(result.race_report);
  const goalSummaryCopy =
    [
      goals.goal_type ? getSeasonGoalTypeLabel(goals.goal_type) : "",
      goals.target_time ? `Zielzeit ${goals.target_time}` : "",
      targetMetricValue ? `${resultMetricLabel} ${targetMetricValue}` : "",
      goals.target_place_age_group ? `AK-Ziel ${goals.target_place_age_group}` : ""
    ].filter(Boolean).join(" · ") ||
    "Noch kein Zieltyp gewählt";
  const logisticsSummaryCopy =
    [
      `${logisticsDoneCount} Punkte geklärt`,
      logistics.bib_number ? `Startnr. ${logistics.bib_number}` : ""
    ].filter(Boolean).join(" · ");
  const equipmentSummaryCopy =
    normalizeSeasonAreaStatus(equipment.status) === "not_needed"
      ? "Nicht benötigt"
      : normalizeSeasonAreaStatus(equipment.status) === "done" ||
        normalizeSeasonAreaStatus(equipment.status) === "planned"
        ? "Geplant"
        : "Noch keine Ausrüstung geplant";
  const nutritionSummaryCopy =
    normalizeSeasonAreaStatus(nutrition.status) === "not_needed" ||
    cleanValue(nutrition.type) === "not_needed"
      ? "Nicht benötigt"
      : normalizeSeasonAreaStatus(nutrition.status) === "done" ||
        normalizeSeasonAreaStatus(nutrition.status) === "planned"
        ? "Geplant"
        : cleanValue(nutrition.type)
          ? SEASON_AREA_STATUS_LABELS[nutrition.type] || "Plan begonnen"
          : "Noch kein Verpflegungsplan";
  const resultSummaryCopy =
    hasResult
      ? [
          result.finish_status ? getSeasonFinishStatusLabel(result.finish_status) : "",
          result.finish_time ? `Finish ${result.finish_time}` : "",
          goalDelta,
          result.age_group_place ? `AK ${result.age_group_place}` : ""
        ].filter(Boolean).join(" · ")
      : isSeasonEventPast(event)
        ? "Ergebnis kann eingetragen werden"
        : "Kann nach dem Event ergänzt werden";
  const notesSummaryCopy =
    [
      noteValue ? "Persönliche Notiz" : "",
      goalNote ? "Zielnotiz" : "",
      raceReport ? "Rennbericht" : ""
    ].filter(Boolean).join(" · ") ||
    "Noch keine Notizen";
  const resultMetricSummary =
    summary.sportType === "triathlon"
      ? ""
      : renderSeasonDashboardMetric(resultMetricLabel, finishMetricValue || targetMetricValue);
  const prepSummary =
    getSeasonPreparationSummary(event, details);
  const daysUntil =
    getSeasonDaysUntil(event);
  const daysLabel =
    daysUntil === null
      ? "-"
      : daysUntil < 0
        ? `Vor ${Math.abs(daysUntil)} Tagen`
        : daysUntil === 0
          ? "Heute ist Race Day"
          : `${daysUntil} Tage bis zum Rennen`;
  const trainingPhase =
    getSeasonTrainingPhase(event);
  const priority =
    getSeasonPriority(event);
  const raceLoad =
    getSeasonRaceLoad(event);
  const placeLabel =
    [event.city, event.country].filter(Boolean).join(", ");
  const overviewFacts =
    [
      cleanValue(event.date),
      cleanValue(placeLabel),
      cleanValue(event.sport || "Event"),
      cleanValue(getSeasonDisplayDistance(event))
    ].filter(Boolean).join(" · ");
  const missingPreview =
    prepSummary.missing
      .slice(0, 4)
      .map(area => area.label);

  if (isPast) {
    const postStatus =
      getSeasonPostRaceStatus(details);
    const finishStatusLabel =
      result.finish_status
        ? getSeasonFinishStatusLabel(result.finish_status)
        : hasResult
          ? "Finished"
          : "Noch nicht eingetragen";
    const resultPrimaryLabel =
      hasResult
        ? result.finish_time || finishStatusLabel
        : "Noch nicht eingetragen";
    const reflectionSummary =
      hasSeasonReflection(result)
        ? "Reflexion ergänzt"
        : "Reflexion noch offen";

    return `
      <div class="season-race-dashboard season-post-race-dashboard">
        <section class="season-race-overview-card season-post-race-overview" aria-label="${escapeHTML(event.event_name)} Rückblick">
          <div class="season-overview-copy">
            <span class="season-overview-eyebrow">Race Review</span>
            <h3>${escapeHTML(event.event_name)}</h3>
            <p>${escapeHTML(overviewFacts || "Eventdetails noch nicht vollständig")}</p>
            <div class="season-overview-chip-row">
              <span class="season-priority-badge season-priority-${priority.toLowerCase().replace(/\s+/g, "-")}">
                ${escapeHTML(getSeasonPriorityLabel(priority))}
              </span>
              <span class="season-race-chip season-post-race-status season-post-race-status-${postStatus.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">
                ${escapeHTML(postStatus)}
              </span>
              <span class="season-race-chip">${escapeHTML(daysLabel)}</span>
              ${postRace.archived ? `<span class="season-race-chip season-post-race-archive-chip">Archiv</span>` : ""}
            </div>
          </div>
          <div class="season-overview-kpis season-post-race-kpis">
            <span class="season-overview-kpi season-overview-kpi-primary">
              <em>${hasResult ? "Finish Time" : "Ergebnis"}</em>
              <strong>${escapeHTML(resultPrimaryLabel)}</strong>
            </span>
            <span class="season-overview-kpi">
              <em>Finish Status</em>
              <strong>${escapeHTML(finishStatusLabel)}</strong>
            </span>
            <span class="season-overview-kpi">
              <em>Overall</em>
              <strong>${escapeHTML(result.overall_place || "-")}</strong>
            </span>
            <span class="season-overview-kpi">
              <em>Age Group</em>
              <strong>${escapeHTML(result.age_group_place || "-")}</strong>
            </span>
            ${result.gender_place ? `
              <span class="season-overview-kpi">
                <em>Gender</em>
                <strong>${escapeHTML(result.gender_place)}</strong>
              </span>
            ` : ""}
            <span class="season-overview-kpi">
              <em>Rating</em>
              <strong>${escapeHTML(result.personal_rating ? `${result.personal_rating} / 5` : "-")}</strong>
            </span>
            <span class="season-overview-kpi">
              <em>Event</em>
              <strong>${escapeHTML(daysLabel)}</strong>
            </span>
          </div>
          <div class="season-overview-progress season-post-race-summary">
            <span>
              <strong>${escapeHTML(prepSummary.openSummary)}</strong>
              <em>${escapeHTML(prepSummary.nextTask)}</em>
            </span>
            ${!hasResult ? `
              <button type="button" data-season-result-edit="${escapeHTML(eventKey)}">
                Ergebnis eintragen
              </button>
            ` : ""}
          </div>
        </section>
        <div class="season-event-planner-shell">
          <main class="season-event-planner-main">
            ${renderSeasonDetailPanel({
              title: seasonPlannerText("season.result", "Ergebnis"),
              summary: resultSummaryCopy,
              open: true,
              body: renderSeasonResultPanel({
                event,
                eventKey,
                result,
                summary,
                distanceLabel,
                finishMetricValue,
                goalDelta,
                hasResult
              })
            })}
            ${renderSeasonDetailPanel({
              title: "Race Review",
              summary: `${prepSummary.status} · ${prepSummary.nextTask}`,
              open: true,
              body: renderSeasonPostRaceReviewPanel(prepSummary)
            })}
            ${renderSeasonDetailPanel({
              title: "Persönliche Reflexion",
              summary: reflectionSummary,
              open: hasResult && !hasSeasonReflection(result),
              body: `
                <div class="season-detail-fields">
                  ${renderSeasonRatingControl(eventKey, result)}
                  ${renderSeasonPlannerTextarea({ eventKey, path: "result.went_well", labelKey: "", fallback: "Was lief gut?", value: result.went_well, placeholder: "Was möchtest du beibehalten?" })}
                  ${renderSeasonPlannerTextarea({ eventKey, path: "result.what_was_difficult", labelKey: "", fallback: "Was war schwierig?", value: result.what_was_difficult, placeholder: "Was hat Energie gekostet oder nicht funktioniert?" })}
                  ${renderSeasonPlannerTextarea({ eventKey, path: "result.next_time_change", labelKey: "", fallback: "Was nächstes Mal ändern?", value: result.next_time_change, placeholder: "Was würdest du anpassen?" })}
                  ${renderSeasonPlannerTextarea({ eventKey, path: "result.nutrition_worked", labelKey: "", fallback: "Verpflegung", value: result.nutrition_worked, placeholder: "Was hat bei der Verpflegung funktioniert?" })}
                  ${renderSeasonPlannerTextarea({ eventKey, path: "result.equipment_worked", labelKey: "", fallback: "Equipment", value: result.equipment_worked, placeholder: "Welches Equipment war gut oder problematisch?" })}
                  ${renderSeasonPlannerTextField({ eventKey, path: "result.would_repeat", labelKey: "", fallback: "Wieder teilnehmen?", value: result.would_repeat, placeholder: "Ja, Nein, Vielleicht..." })}
                  ${renderSeasonPlannerTextarea({ eventKey, path: "result.key_learnings", labelKey: "", fallback: "Wichtigste Learnings", value: result.key_learnings, placeholder: "Was nimmst du für das nächste Event mit?" })}
                </div>
              `
            })}
            ${renderSeasonPastPlanningPanels({
              event,
              eventKey,
              goals,
              logistics,
              equipment,
              nutrition,
              noteValue,
              goalNote,
              raceReport,
              targetMetricValue,
              resultMetricLabel,
              trainingPhase,
              daysLabel,
              raceLoad,
              goalSummaryCopy,
              logisticsSummaryCopy,
              equipmentSummaryCopy,
              nutritionSummaryCopy,
              notesSummaryCopy
            })}
          </main>
          <aside class="season-event-planner-sidebar" aria-label="Post-Race Status">
            <div class="season-sidebar-card season-sidebar-card-progress">
              <span>Post-Race Status</span>
              <strong>${escapeHTML(prepSummary.status)}</strong>
              <em>${escapeHTML(prepSummary.openSummary)}</em>
            </div>
            <div class="season-sidebar-card">
              <span>Nächster Schritt</span>
              <strong>${escapeHTML(prepSummary.nextTask)}</strong>
              <em>${escapeHTML(reflectionSummary)}</em>
            </div>
            <div class="season-sidebar-card">
              <span>Event</span>
              <strong>${escapeHTML(daysLabel)}</strong>
              <em>${escapeHTML(finishStatusLabel)}</em>
            </div>
            <div class="season-sidebar-card">
              <span>Archiv</span>
              <strong>${postRace.archived ? "Archiviert" : "Aktiv sichtbar"}</strong>
              <em>Bleibt in Past Events und Statistiken erhalten.</em>
              ${renderSeasonArchiveAction(eventKey, postRace)}
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  return `
    <div class="season-race-dashboard">
      <section class="season-race-overview-card" aria-label="${escapeHTML(event.event_name)} Planung">
        <div class="season-overview-copy">
          <span class="season-overview-eyebrow">Race Overview</span>
          <h3>${escapeHTML(event.event_name)}</h3>
          <p>${escapeHTML(overviewFacts || "Eventdetails noch nicht vollständig")}</p>
          <div class="season-overview-chip-row">
            <span class="season-priority-badge season-priority-${priority.toLowerCase().replace(/\s+/g, "-")}">
              ${escapeHTML(getSeasonPriorityLabel(priority))}
            </span>
            <span class="season-load-badge season-load-${raceLoad.level.toLowerCase().replace(/\s+/g, "-")}">
              ${escapeHTML(getSeasonPlanningLoadLabel(raceLoad.level))}
            </span>
            <span class="season-race-chip">${escapeHTML(prepSummary.status)}</span>
            <span class="season-race-chip">${escapeHTML(trainingPhase)}</span>
          </div>
        </div>
        <div class="season-overview-kpis">
          <span class="season-overview-kpi season-overview-kpi-primary">
            <em>Countdown</em>
            <strong>${escapeHTML(daysLabel)}</strong>
          </span>
          <span class="season-overview-kpi">
            <em>Trainingsphase</em>
            <strong>${escapeHTML(trainingPhase)}</strong>
          </span>
          <span class="season-overview-kpi">
            <em>Planungsstatus</em>
            <strong>${escapeHTML(prepSummary.status)}</strong>
          </span>
          <span class="season-overview-kpi">
            <em>Nächster Schritt</em>
            <strong>${escapeHTML(prepSummary.nextTask)}</strong>
          </span>
        </div>
        <div class="season-overview-progress">
          <span>
            <strong>${escapeHTML(prepSummary.openSummary)}</strong>
            <em>${missingPreview.length ? `Offen: ${escapeHTML(missingPreview.join(", "))}` : "Alle wichtigen Punkte geklärt"}</em>
          </span>
          <div class="season-progress-track season-progress-track-subtle" aria-label="Dezenter Planungsfortschritt">
            <b style="width: ${Math.max(0, Math.min(100, prepSummary.percent))}%"></b>
          </div>
        </div>
      </section>
      <div class="season-event-planner-shell">
        <main class="season-event-planner-main">
      <div class="season-race-summary-grid">
        ${renderSeasonDashboardMetric("Zielzeit", goals.target_time)}
        ${renderSeasonDashboardMetric("Finishzeit", result.finish_time)}
        ${renderSeasonDashboardMetric("Zielabweichung", goalDelta)}
        ${resultMetricSummary}
        ${renderSeasonDashboardMetric("Platz gesamt", result.overall_place)}
        ${renderSeasonDashboardMetric("Platz AK", result.age_group_place)}
        ${renderSeasonDashboardMetric("Bewertung", result.personal_rating ? `${result.personal_rating}/5` : "")}
      </div>
      ${hasResult ? "" : `<p class="season-result-empty">Noch kein Ergebnis eingetragen.</p>`}
      ${renderSeasonSplitSummary(result)}
      <div class="season-status-strip">
        ${renderSeasonStatusChip("Anmeldung bestätigt", logistics.registration_confirmed)}
        ${renderSeasonStatusChip("Reise gebucht", logistics.travel_booked)}
        ${renderSeasonStatusChip("Unterkunft gebucht", logistics.accommodation_booked)}
      </div>
      <div class="season-detail-panels">
        ${renderSeasonDetailPanel({
          title: "Aufgaben",
          summary: `${prepSummary.openSummary} · ${prepSummary.nextTask}`,
          open: true,
          body: `
            ${renderSeasonChecklist(prepSummary)}
            <p class="season-guidance-copy">Nächster sinnvoller Schritt: <strong>${escapeHTML(prepSummary.nextTask)}</strong></p>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Training",
          summary: `${trainingPhase} · ${daysLabel}`,
          open: true,
          body: `
            <div class="season-training-summary">
              ${renderSeasonDashboardMetric("Trainingsphase", trainingPhase, { allowEmpty: true })}
              ${renderSeasonDashboardMetric("Race Load", getSeasonPlanningLoadLabel(raceLoad.level), { allowEmpty: true })}
              ${renderSeasonDashboardMetric("Countdown", daysLabel, { allowEmpty: true })}
            </div>
            <p class="season-guidance-copy">Nutze Zielzeit, Race Strategy und Notizen, um den aktuellen Block mit realistischen Erwartungen zu verbinden.</p>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Ziel & Race Strategy",
          summary: goalSummaryCopy,
          open: !goals.goal_type,
          body: `
            <div class="season-status-strip">
              ${renderSeasonStatusSelect({ eventKey, path: "goals.goal_status", label: "Ziel", value: goals.goal_status, doneLabel: "Geklärt" })}
              ${renderSeasonStatusSelect({ eventKey, path: "goals.strategy_status", label: "Race Strategy", value: goals.strategy_status, doneLabel: "Geplant" })}
            </div>
            ${renderSeasonGoalTypeControl(eventKey, goals)}
            ${renderSeasonGoalFields(eventKey, goals, targetMetricValue, resultMetricLabel)}
          `
        })}
        ${renderSeasonDetailPanel({
          title: seasonPlannerText("season.travelBooking", "Reise & Buchungen"),
          summary: logisticsSummaryCopy,
          body: `
            <div class="season-detail-checks season-detail-checks-compact">
              ${renderSeasonPlannerCheckbox({ eventKey, path: "logistics.registration_confirmed", labelKey: "season.registrationConfirmed", fallback: "Anmeldung bestätigt", checked: logistics.registration_confirmed })}
            </div>
            <div class="season-detail-fields">
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.travel_status", label: "Reise", value: logistics.travel_status || (logistics.travel_booked ? "done" : "open"), doneLabel: "Gebucht" })}
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.accommodation_status", label: "Unterkunft", value: logistics.accommodation_status || (logistics.accommodation_booked ? "done" : "open"), doneLabel: "Gebucht" })}
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.bib_status", label: "Startunterlagen", value: logistics.bib_status || (logistics.bib_number ? "done" : "open"), doneLabel: "Geklärt" })}
            </div>
            <div class="season-detail-fields season-detail-fields-compact">
              ${renderSeasonPlannerTextField({ eventKey, path: "logistics.bib_number", labelKey: "season.bibNumber", fallback: "Startnummer", value: logistics.bib_number, placeholder: "A1234" })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "logistics.travel_note", labelKey: "season.travelNote", fallback: "Reisenotiz", value: logistics.travel_note, placeholderKey: "season.travelNotePlaceholder", placeholder: "Hotel, Zug, Startbereich, Abholung..." })}
            </div>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Equipment",
          summary: equipmentSummaryCopy,
          tone: "equipment",
          panelKey: `equipment:${eventKey}`,
          body: renderSeasonEquipmentChecklist(event, eventKey, equipment)
        })}
        ${renderSeasonDetailPanel({
          title: "Verpflegung",
          summary: nutritionSummaryCopy,
          body: renderSeasonNutritionPlanner(eventKey, nutrition)
        })}
        ${renderSeasonDetailPanel({
          title: seasonPlannerText("season.result", "Ergebnis"),
          summary: resultSummaryCopy,
          tone: resultMuted,
          open: isSeasonEventPast(event) && !hasResult,
          body: renderSeasonResultPanel({
            event,
            eventKey,
            result,
            summary,
            distanceLabel,
            finishMetricValue,
            goalDelta,
            hasResult
          })
        })}
        ${renderSeasonDetailPanel({
          title: seasonPlannerText("season.personalNotes", "Notizen"),
          summary: notesSummaryCopy,
          body: `
            <div class="season-status-strip">
              ${renderSeasonStatusSelect({ eventKey, path: "goals.notes_status", label: "Notizen", value: goals.notes_status, doneLabel: "Gepflegt" })}
            </div>
            <div class="season-note-preview-grid">
              ${renderSeasonCompactPreview("Persönliche Notiz", noteValue, "Noch keine persönliche Notiz.")}
              ${renderSeasonCompactPreview("Zielnotiz", goalNote, "Noch keine Zielnotiz.")}
              ${renderSeasonCompactPreview("Rennbericht", raceReport, "Noch kein Rennbericht.")}
            </div>
            <div class="season-detail-fields">
              ${renderSeasonPlannerTextarea({
                eventKey,
                path: "personal_note",
                labelKey: "season.personalNote",
                fallback: "Persönliche Notiz",
                value: noteValue,
                placeholderKey: "season.personalNotePlaceholder",
                placeholder: "Training, Logistik, Fokus...",
                legacyNote: true
              })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "goals.target_description", labelKey: "season.targetDescription", fallback: "Zielnotiz", value: goals.target_description, placeholderKey: "season.goalPlaceholder", placeholder: "Ziel, Strategie, Pacings..." })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "result.race_report", labelKey: "season.raceReport", fallback: "Rennbericht", value: result.race_report, placeholderKey: "season.raceReportPlaceholder", placeholder: "Wie lief das Rennen?" })}
            </div>
          `
        })}
      </div>
        </main>
        <aside class="season-event-planner-sidebar" aria-label="Planungsstatus">
          <div class="season-sidebar-card season-sidebar-card-progress">
            <span>Planungsstatus</span>
            <strong>${escapeHTML(prepSummary.status)}</strong>
            <em>${escapeHTML(prepSummary.openSummary)}</em>
            <div class="season-progress-track season-progress-track-subtle">
              <b style="width: ${Math.max(0, Math.min(100, prepSummary.percent))}%"></b>
            </div>
          </div>
          <div class="season-sidebar-card">
            <span>Nächster Schritt</span>
            <strong>${escapeHTML(prepSummary.nextTask)}</strong>
            <em>${escapeHTML(prepSummary.status)}</em>
          </div>
          <div class="season-sidebar-card">
            <span>Race Timing</span>
            <strong>${escapeHTML(daysLabel)}</strong>
            <em>${escapeHTML(trainingPhase)}</em>
          </div>
          ${prepSummary.missing.length ? `
            <div class="season-sidebar-card">
              <span>Noch offen</span>
              <div class="season-missing-list">
                ${prepSummary.missing.slice(0, 6).map(area => `
                  <b>${escapeHTML(area.label)}</b>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </aside>
      </div>
    </div>
  `;
}

function getSeasonClassificationContext(event) {
  const plannedDistance =
    getSeasonPlannedDistance(event);

  return (plannedDistance
    ? plannedDistance
    : `${event.sport || ""} ${getSeasonDisplayDistance(event)} ${event.event_name || ""}`)
    .toLowerCase();
}

function getSeasonDistanceNumber(context, unitPattern) {
  const match =
    new RegExp(`(\\d+(?:[\\.,]\\d+)?)\\s*(?:${unitPattern})`, "i")
      .exec(context);

  return match
    ? Number(match[1].replace(",", "."))
    : null;
}

function getSeasonDistanceCategory(event) {
  const context =
    getSeasonClassificationContext(event);

  const km =
    getSeasonDistanceNumber(context, "km|kilometer|kilometres|kilometers");

  const miles =
    getSeasonDistanceNumber(context, "miles|mile|mi");

  if (/triathlon|ironman|70\.3|sprint tri|olympic tri|middle tri|full tri|mitteldistanz|langdistanz/.test(context)) {
    return "Triathlon";
  }

  if (/backyard|24\s*h|24\s*hour|12\s*h|12\s*hour/.test(context)) {
    return "Ultra";
  }

  if (/100\s*miles|100\s*mi|100\s*km|ultra/.test(context)) {
    return "Ultra";
  }

  if (km !== null) {
    if (km >= 45) return "Ultra";
    if (km >= 38 && km <= 44.5) return "Marathon";
    if (km >= 18 && km <= 24) return "Half";
    if (km >= 9 && km <= 11) return "10K";
    if (km >= 4.5 && km <= 6.5) return "5K";
  }

  if (miles !== null) {
    if (miles >= 31) return "Ultra";
    if (miles >= 24 && miles <= 28) return "Marathon";
    if (miles >= 12 && miles <= 15) return "Half";
    if (miles >= 5.5 && miles <= 7) return "10K";
    if (miles >= 2.8 && miles <= 4.2) return "5K";
  }

  if (/half|halbmarathon|21\.?1/.test(context)) {
    return "Half";
  }

  if (/(^|\s)marathon(\s|$)|42\.?2/.test(context)) {
    return "Marathon";
  }

  if (/10\s*k/.test(context)) {
    return "10K";
  }

  if (/5\s*k/.test(context)) {
    return "5K";
  }

  return "Other";
}

function getSeasonDistanceKm(event) {
  const context =
    getSeasonClassificationContext(event);

  const km =
    getSeasonDistanceNumber(
      context,
      "km|kilometer|kilometres|kilometers"
    );

  if (km !== null) {
    return km;
  }

  const miles =
    getSeasonDistanceNumber(
      context,
      "miles|mile|mi"
    );

  if (miles !== null) {
    return miles * 1.60934;
  }

  const category =
    getSeasonDistanceCategory(event);

  const defaults = {
    "5K": 5,
    "10K": 10,
    Half: 21.1,
    Marathon: 42.2
  };

  return defaults[category] || null;
}

function getSeasonPriorityLabel(priority) {
  const labels = {
    A: "A Race",
    B: "B Race",
    C: "C Race",
    Training: "Training",
    Maybe: "Maybe"
  };

  return labels[priority] || "Maybe";
}

function getSeasonMonthLabel(event) {
  const date =
    parseSeasonDate(event.date);

  if (!date) {
    return "Unscheduled";
  }

  return date.toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric"
    }
  );
}

function getSeasonSportBreakdown(favoriteEvents) {
  return favoriteEvents.reduce(
    (counts, event) => {
      const label =
        getEventFormatLabel(event);

      if (/triathlon/i.test(label)) {
        counts.Triathlon += 1;
      } else if (/ultra|backyard|timed/i.test(label)) {
        counts.Ultra += 1;
      } else {
        counts.Running += 1;
      }

      return counts;
    },
    {
      Running: 0,
      Triathlon: 0,
      Ultra: 0
    }
  );
}

function getSeasonRaceLoad(event) {
  const context =
    getSeasonClassificationContext(event);

  const category =
    getSeasonDistanceCategory(event);

  if (
    /100\s*miles|100\s*mi|100\s*km|backyard|24\s*h|24\s*hour|ironman|full\b|langdistanz/.test(context)
  ) {
    return {
      level: "Very High",
      score: 4,
      recoveryDays: 30
    };
  }

  if (category === "Ultra" || /70\.3|middle|mitteldistanz/.test(context)) {
    return {
      level: "High",
      score: 3,
      recoveryDays: 21
    };
  }

  if (category === "Marathon") {
    return {
      level: "High",
      score: 3,
      recoveryDays: 21
    };
  }

  if (category === "Half" || /olympic|kurzdistanz|standard distance/.test(context)) {
    return {
      level: "Medium",
      score: 2,
      recoveryDays: 10
    };
  }

  return {
    level: "Low",
    score: 1,
      recoveryDays: 5
  };
}

function getSeasonPriorityScore(priority) {
  if (priority === "A") return 1;
  if (priority === "B") return 0.65;
  if (priority === "C") return 0.35;
  if (priority === "Training") return 0.15;
  return 0.25;
}

function getSeasonLoadColor(percent) {
  if (percent >= 82) return "#ef4444";
  if (percent >= 64) return "#f97316";
  if (percent >= 46) return "#f59e0b";
  if (percent >= 26) return "#22c55e";
  return "#38bdf8";
}

function getSeasonLoadLabel(percent) {
  if (percent >= 82) return "Very demanding";
  if (percent >= 64) return "Demanding";
  if (percent >= 46) return "Balanced";
  if (percent >= 26) return "Light";
  return "Very light";
}

function getSeasonPlanningLoadLabel(level) {
  const labels = {
    Low: "Easy",
    Medium: "Moderate",
    High: "Hard",
    "Very High": "Very hard"
  };

  return labels[level] || level || "Moderate";
}

function getSeasonLoadSummary(eventsForSeason, closeWarnings = []) {
  const counts = {
    Low: 0,
    Medium: 0,
    High: 0,
    "Very High": 0
  };

  let totalScore = 0;
  let weightedScore = 0;

  eventsForSeason.forEach(event => {
    const load =
      getSeasonRaceLoad(event);

    const priorityWeight =
      getSeasonPriorityScore(getSeasonPriority(event));

    counts[load.level] += 1;
    totalScore += load.score;
    weightedScore += load.score * (1 + priorityWeight);
  });

  const averageScore =
    eventsForSeason.length
      ? totalScore / eventsForSeason.length
      : 0;

  const volumeScore =
    Math.min(28, eventsForSeason.length * 3.8);

  const intensityScore =
    Math.min(42, weightedScore * 4.4);

  const conflictScore =
    Math.min(
      20,
      closeWarnings.reduce(
        (score, warning) =>
          score + (warning.severity === "high" ? 8 : 5),
        0
      )
    );

  const aRaceScore =
    Math.min(
      10,
      eventsForSeason.filter(event =>
        getSeasonPriority(event) === "A"
      ).length * 3
    );

  const percent =
    Math.min(
      100,
      Math.round(
        volumeScore +
        intensityScore +
        conflictScore +
        aRaceScore
      )
    );

  const color =
    getSeasonLoadColor(percent);

  const label =
    getSeasonLoadLabel(percent);

  return {
    counts,
    totalScore,
    weightedScore,
    averageScore,
    volumeScore,
    intensityScore,
    conflictScore,
    aRaceScore,
    percent,
    color,
    label
  };
}

function getSeasonPrioritySummary(eventsForSeason) {
  return eventsForSeason.reduce(
    (counts, event) => {
      const priority =
        getSeasonPriority(event);

      counts[priority] =
        (counts[priority] || 0) + 1;

      return counts;
    },
    {
      A: 0,
      B: 0,
      C: 0,
      Training: 0,
      Maybe: 0
    }
  );
}

function getNextKeyRace(eventsForSeason) {
  const upcoming =
    getUpcomingSeasonEvents(eventsForSeason);

  return upcoming.find(event =>
    getSeasonPriority(event) === "A"
  ) || upcoming.find(event =>
    getSeasonPriority(event) === "B"
  ) || upcoming[0] || null;
}

function getSeasonDistanceMix(eventsForSeason) {
  return eventsForSeason.reduce(
    (counts, event) => {
      const category =
        getSeasonDistanceCategory(event);

      counts[category] =
        (counts[category] || 0) + 1;

      return counts;
    },
    {
      "5K": 0,
      "10K": 0,
      Half: 0,
      Marathon: 0,
      Ultra: 0,
      Triathlon: 0,
      Other: 0
    }
  );
}

function getMonthDensitySummary(eventsForSeason) {
  return Object.entries(groupSeasonEventsByMonth(eventsForSeason))
    .filter(([label]) => label !== "Unscheduled")
    .sort((first, second) => second[1].length - first[1].length);
}

function getMonthDensityTimeline(eventsForSeason) {
  return Object.entries(groupSeasonEventsByMonth(eventsForSeason))
    .filter(([label]) => label !== "Unscheduled");
}

function getPercent(value, total) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function buildSportMixGradient(sportCounts) {
  const total =
    Object.values(sportCounts)
      .reduce((sum, count) => sum + count, 0);

  if (!total) {
    return "#e5e7eb 0 100%";
  }

  const colors = {
    Running: "#22c55e",
    Triathlon: "#38bdf8",
    Ultra: "#8b5cf6"
  };

  let start = 0;

  return Object.entries(sportCounts)
    .map(([label, count]) => {
      const end =
        start + getPercent(count, total);

      const segment =
        `${colors[label] || "#94a3b8"} ${start}% ${end}%`;

      start = end;

      return segment;
    })
    .join(", ");
}

function getSeasonDateRange(eventsForSeason) {
  const datedEvents =
    eventsForSeason
      .map(event => parseSeasonDate(event.date))
      .filter(Boolean);

  if (!datedEvents.length) {
    return null;
  }

  return {
    first: datedEvents[0],
    last: datedEvents[datedEvents.length - 1]
  };
}

function getAverageDaysBetweenEvents(eventsForSeason) {
  const dates =
    eventsForSeason
      .map(event => parseSeasonDate(event.date))
      .filter(Boolean);

  if (dates.length < 2) {
    return null;
  }

  const gaps = [];

  for (let index = 1; index < dates.length; index += 1) {
    gaps.push(
      Math.round(
        (dates[index].getTime() - dates[index - 1].getTime()) /
        86400000
      )
    );
  }

  return Math.round(
    gaps.reduce((sum, gap) => sum + gap, 0) /
    gaps.length
  );
}

function getBusiestSeasonMonth(eventsForSeason) {
  const groups =
    groupSeasonEventsByMonth(eventsForSeason);

  const entries =
    Object.entries(groups);

  if (!entries.length) {
    return null;
  }

  return entries.sort(
    (first, second) =>
      second[1].length - first[1].length
  )[0];
}

function getCloseRaceWarnings(upcomingEvents) {
  const warnings = [];

  for (let index = 1; index < upcomingEvents.length; index += 1) {
    const previous =
      upcomingEvents[index - 1];

    const current =
      upcomingEvents[index];

    const previousDate =
      parseSeasonDate(previous.date);

    const currentDate =
      parseSeasonDate(current.date);

    if (!previousDate || !currentDate) {
      continue;
    }

    const daysBetween =
      Math.round(
        (currentDate.getTime() - previousDate.getTime()) /
        86400000
      );

    const previousLoad =
      getSeasonRaceLoad(previous);

    const currentLoad =
      getSeasonRaceLoad(current);

    const recommendedGap =
      Math.max(
        previousLoad.recoveryDays,
        Math.ceil(currentLoad.recoveryDays / 2)
      );

    if (daysBetween >= 0 && daysBetween < recommendedGap) {
      warnings.push({
        daysBetween,
        recommendedGap,
        severity:
          daysBetween <= Math.ceil(recommendedGap / 2)
            ? "high"
            : "medium",
        previous,
        current
      });
    }
  }

  return warnings;
}

function getDaysBetweenDates(firstDate, secondDate) {
  return Math.round(
    (secondDate.getTime() - firstDate.getTime()) /
    86400000
  );
}

function getPriorityBalancePenalty(prioritySummary, eventCount) {
  if (!eventCount) {
    return 0;
  }

  const aRaceRatio =
    prioritySummary.A / eventCount;

  let penalty = 0;

  if (prioritySummary.A > 3) {
    penalty += (prioritySummary.A - 3) * 7;
  }

  if (aRaceRatio > 0.45) {
    penalty += Math.round((aRaceRatio - 0.45) * 38);
  }

  if (
    prioritySummary.B === 0 &&
    prioritySummary.C === 0 &&
    eventCount > 2
  ) {
    penalty += 8;
  }

  return penalty;
}

function getMonthDistributionPenalty(eventsForSeason) {
  const monthGroups =
    Object.values(groupSeasonEventsByMonth(eventsForSeason))
      .filter(monthEvents => monthEvents.length);

  if (!monthGroups.length) {
    return 0;
  }

  const maxMonthCount =
    Math.max(...monthGroups.map(monthEvents => monthEvents.length));

  const denseMonthPenalty =
    Math.max(0, maxMonthCount - 2) * 7;

  const oneMonthSeasonPenalty =
    eventsForSeason.length > 3 &&
    monthGroups.length === 1
      ? 12
      : 0;

  return denseMonthPenalty + oneMonthSeasonPenalty;
}

function getSpacingPenalty(eventsForSeason) {
  const averageGap =
    getAverageDaysBetweenEvents(eventsForSeason);

  if (averageGap === null) {
    return 0;
  }

  if (averageGap < 14) return 18;
  if (averageGap < 21) return 10;
  if (averageGap > 95 && eventsForSeason.length > 2) return 4;

  return 0;
}

function getSeasonScoreSummary(eventsForSeason, closeWarnings, prioritySummary) {
  if (!eventsForSeason.length) {
    return {
      score: 0,
      label: "Start planning",
      className: "empty",
      explanation: "Save races to calculate your season score."
    };
  }

  // Season Score starts from 100 and subtracts planning risks:
  // close races, too many A-races, dense months and poor average spacing.
  const recoveryPenalty =
    closeWarnings.reduce(
      (sum, warning) =>
        sum + (warning.severity === "high" ? 18 : 10),
      0
    );

  const priorityPenalty =
    getPriorityBalancePenalty(
      prioritySummary,
      eventsForSeason.length
    );

  const densityPenalty =
    getMonthDistributionPenalty(eventsForSeason);

  const spacingPenalty =
    getSpacingPenalty(eventsForSeason);

  const score =
    Math.max(
      0,
      Math.min(
        100,
        100 -
        recoveryPenalty -
        priorityPenalty -
        densityPenalty -
        spacingPenalty
      )
    );

  let label = "Excellent";
  let className = "excellent";
  let explanation =
    "Your season is well balanced.";

  if (score < 45) {
    label = "Overloaded";
    className = "overloaded";
    explanation =
      "Several races are scheduled too closely together.";
  } else if (score < 68) {
    label = "Busy";
    className = "busy";
    explanation =
      "Your season has some load or spacing risks.";
  } else if (score < 84) {
    label = "Good";
    className = "good";
    explanation =
      "Your season is solid with a few areas to review.";
  }

  return {
    score,
    label,
    className,
    explanation
  };
}

function getLongestTrainingBlock(eventsForSeason) {
  const datedEvents =
    getUpcomingSeasonEvents(eventsForSeason)
      .map(event => ({
        event,
        date: parseSeasonDate(event.date)
      }))
      .filter(item => item.date)
      .sort((first, second) =>
        first.date.getTime() - second.date.getTime()
      );

  if (datedEvents.length < 2) {
    return null;
  }

  return datedEvents
    .slice(1)
    .reduce((best, current, index) => {
      const previous =
        datedEvents[index];

      const days =
        getDaysBetweenDates(previous.date, current.date);

      if (!best || days > best.days) {
        return {
          days,
          previous: previous.event,
          current: current.event
        };
      }

      return best;
    }, null);
}

function getTrainingOpportunity(eventsForSeason) {
  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  const nextARace =
    getUpcomingSeasonEvents(eventsForSeason)
      .find(event =>
        getSeasonPriority(event) === "A"
      );

  if (!nextARace) {
    return null;
  }

  const raceDate =
    parseSeasonDate(nextARace.date);

  if (!raceDate) {
    return null;
  }

  const days =
    Math.max(
      0,
      getDaysBetweenDates(today, raceDate)
    );

  if (days <= 21) {
    return {
      days,
      phase: "Race Ready Phase",
      text: "Race approaching. Focus on execution.",
      event: nextARace
    };
  }

  if (days <= 60) {
    return {
      days,
      phase: "Specific Training Phase",
      text: "Time to sharpen race-specific fitness.",
      event: nextARace
    };
  }

  return {
    days,
    phase: "Base Building Opportunity",
    text: "Plenty of time to build fitness.",
    event: nextARace
  };
}

function getSeasonTrainingBlocks(eventsForSeason) {
  const datedEvents =
    getUpcomingSeasonEvents(eventsForSeason)
      .map(event => ({
        event,
        date: parseSeasonDate(event.date)
      }))
      .filter(item => item.date)
      .sort((first, second) =>
        first.date.getTime() - second.date.getTime()
      );

  return datedEvents
    .slice(1)
    .map((current, index) => {
      const previous =
        datedEvents[index];

      const days =
        getDaysBetweenDates(previous.date, current.date);

      let label = "Long build";
      let level = "long";
      let text = "Plenty of time for a focused training block.";

      if (days < 7) {
        label = "Tight spacing";
        level = "critical";
        text = "Very little recovery time between races.";
      } else if (days <= 21) {
        label = "Short block";
        level = "short";
        text = "Useful for recovery and sharpening, but not a full build.";
      } else if (days <= 56) {
        label = "Good block";
        level = "good";
        text = "Good window for focused training.";
      }

      return {
        days,
        label,
        level,
        text,
        previous: previous.event,
        current: current.event
      };
    });
}

function getImportantCountdownEvents(eventsForSeason) {
  return getUpcomingSeasonEvents(eventsForSeason)
    .sort((first, second) => {
      const priorityOrder = {
        A: 0,
        B: 1,
        C: 2,
        Maybe: 3,
        Training: 4
      };

      const firstPriority =
        priorityOrder[getSeasonPriority(first)] ?? 3;

      const secondPriority =
        priorityOrder[getSeasonPriority(second)] ?? 3;

      if (firstPriority !== secondPriority) {
        return firstPriority - secondPriority;
      }

      return parseSeasonDate(first.date).getTime() -
        parseSeasonDate(second.date).getTime();
    })
    .slice(0, 6);
}

function getDaysUntilSeasonEvent(event) {
  const date =
    parseSeasonDate(event.date);

  if (!date) {
    return null;
  }

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return Math.max(
    0,
    getDaysBetweenDates(today, date)
  );
}

function getRecommendationProfile(eventsForSeason) {
  const sportCounts =
    getSeasonSportBreakdown(eventsForSeason);

  const distanceMix =
    getSeasonDistanceMix(eventsForSeason);

  const countries =
    eventsForSeason.reduce((counts, event) => {
      const country =
        cleanValue(event.country);

      if (country) {
        counts[country] =
          (counts[country] || 0) + 1;
      }

      return counts;
    }, {});

  const topSport =
    Object.entries(sportCounts)
      .sort((first, second) => second[1] - first[1])[0]?.[0] ||
    "";

  const topDistance =
    Object.entries(distanceMix)
      .filter(([, count]) => count > 0)
      .sort((first, second) => second[1] - first[1])[0]?.[0] ||
    "";

  const topCountry =
    Object.entries(countries)
      .sort((first, second) => second[1] - first[1])[0]?.[0] ||
    "";

  return {
    topSport,
    topDistance,
    topCountry
  };
}

function getSeasonSportBucket(event) {
  const label =
    `${event.sport || ""} ${event.distance || ""} ${event.event_name || ""}`;

  if (/triathlon|ironman|70\.3|sprint|olympic|middle distance|full distance/i.test(label)) {
    return "Triathlon";
  }

  if (/ultra|trail|backyard|100\s?k|100\s?mi|timed|12\s?h|24\s?h/i.test(label)) {
    return "Ultra";
  }

  return "Running";
}

function getRecommendedSeasonEvents(eventsForSeason) {
  if (
    !eventsForSeason.length ||
    typeof events === "undefined"
  ) {
    return [];
  }

  const savedKeys =
    new Set(
      eventsForSeason.map(event =>
        getEventKey(event)
      )
    );

  const profile =
    getRecommendationProfile(eventsForSeason);

  const plannedDates =
    eventsForSeason
      .map(event => parseSeasonDate(event.date))
      .filter(Boolean);

  return events
    .filter(event =>
      !savedKeys.has(getEventKey(event)) &&
      parseSeasonDate(event.date)
    )
    .map(event => {
      let score = 0;

      const sportLabel =
        getSeasonSportBucket(event);

      if (
        profile.topSport &&
        sportLabel === profile.topSport
      ) {
        score += 4;
      }

      if (
        profile.topDistance &&
        getSeasonDistanceCategory(event) === profile.topDistance
      ) {
        score += 5;
      }

      if (
        profile.topCountry &&
        cleanValue(event.country) === profile.topCountry
      ) {
        score += 2;
      }

      if (/official/i.test(`${event.data_source || ""} ${event.source_note || ""}`)) {
        score += 1;
      }

      const eventDate =
        parseSeasonDate(event.date);

      const daysToNearest =
        plannedDates.length
          ? Math.min(
            ...plannedDates.map(date =>
              Math.abs(getDaysBetweenDates(date, eventDate))
            )
          )
          : 999;

      if (daysToNearest < 7) {
        score -= 8;
      } else if (daysToNearest >= 28 && daysToNearest <= 84) {
        score += 4;
      } else if (daysToNearest > 84) {
        score += 2;
      }

      let reason = "Based on your current season.";

      if (
        profile.topDistance &&
        getSeasonDistanceCategory(event) === profile.topDistance
      ) {
        reason = "Similar distance to your planned races.";
      }

      if (
        profile.topSport &&
        sportLabel === profile.topSport
      ) {
        reason = `${sportLabel}-focused fit for your season.`;
      }

      if (daysToNearest >= 28 && daysToNearest <= 84) {
        reason = "Fills a useful training gap in your season.";
      }

      if (
        profile.topCountry &&
        cleanValue(event.country) === profile.topCountry
      ) {
        reason = "Nearby region based on your saved races.";
      }

      return {
        event,
        score,
        reason
      };
    })
    .filter(item => item.score > 0)
    .sort((first, second) =>
      second.score - first.score ||
      parseSeasonDate(first.event.date).getTime() -
      parseSeasonDate(second.event.date).getTime()
    )
    .slice(0, 3)
    .map(item => ({
      ...item.event,
      _seasonRecommendationReason: item.reason
    }));
}

function isCloseRaceEvent(event, warnings) {
  const key =
    getEventKey(event);

  return warnings.some(warning =>
    getEventKey(warning.previous) === key ||
    getEventKey(warning.current) === key
  );
}

function groupSeasonEventsByMonth(eventsForSeason) {
  return eventsForSeason.reduce((groups, event) => {
    const label =
      getSeasonMonthLabel(event);

    groups[label] =
      groups[label] || [];

    groups[label].push(event);

    return groups;
  }, {});
}

function getFavoriteEventsForSeason() {
  if (typeof events === "undefined") {
    return [];
  }

  return events
    .filter(event => isFavorite(event))
    .sort((first, second) => {
      const firstDate =
        parseSeasonDate(first.date);

      const secondDate =
        parseSeasonDate(second.date);

      if (!firstDate && !secondDate) {
        return cleanValue(first.event_name)
          .localeCompare(cleanValue(second.event_name));
      }

      if (!firstDate) return 1;
      if (!secondDate) return -1;

      return firstDate.getTime() - secondDate.getTime();
    });
}

function getSeasonMonthStartDate(monthLabel) {
  const date =
    new Date(`${monthLabel} 1, 12:00:00`);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function getSeasonCalendarWeeks(monthLabel, monthEvents) {
  const monthStart =
    getSeasonMonthStartDate(monthLabel);

  if (!monthStart) {
    return [];
  }

  const year =
    monthStart.getFullYear();

  const month =
    monthStart.getMonth();

  const firstGridDate =
    new Date(year, month, 1);

  firstGridDate.setDate(
    firstGridDate.getDate() -
    ((firstGridDate.getDay() + 6) % 7)
  );

  const eventsByDay =
    monthEvents.reduce((days, event) => {
      const date =
        parseSeasonDate(event.date);

      if (!date) {
        return days;
      }

      const key =
        date.toISOString().slice(0, 10);

      days[key] =
        days[key] || [];

      days[key].push(event);

      return days;
    }, {});

  return Array.from({ length: 42 }, (_item, index) => {
    const date =
      new Date(firstGridDate);

    date.setDate(firstGridDate.getDate() + index);

    const key =
      date.toISOString().slice(0, 10);

    return {
      date,
      key,
      inMonth: date.getMonth() === month,
      events: eventsByDay[key] || []
    };
  });
}

function renderSeasonCalendarEventPill(event, closeWarnings) {
  const priority =
    getSeasonPriority(event);

  const raceLoad =
    getSeasonRaceLoad(event);

  return `
    <button
      type="button"
      class="season-calendar-event-pill ${priority === "A" ? "season-event-a-race" : ""} ${isCloseRaceEvent(event, closeWarnings) ? "season-event-close-warning" : ""}"
      data-season-open="${escapeHTML(getEventKey(event))}"
      title="${escapeHTML(event.event_name)} · ${escapeHTML(getSeasonDisplayDistance(event))}"
    >
      <span>${escapeHTML(getSeasonPriorityLabel(priority).charAt(0))}</span>
      <strong>${escapeHTML(event.event_name)}</strong>
      <em>${escapeHTML(getSeasonPlanningLoadLabel(raceLoad.level))}</em>
    </button>
  `;
}

function renderSeasonMonthCalendar(monthLabel, monthEvents, closeWarnings) {
  const weeks =
    getSeasonCalendarWeeks(monthLabel, monthEvents);

  const visibleWeeks =
    weeks.reduce((rows, day, index) => {
      const rowIndex =
        Math.floor(index / 7);

      rows[rowIndex] =
        rows[rowIndex] || [];

      rows[rowIndex].push(day);

      return rows;
    }, [])
      .filter(row =>
        row.some(day => day.inMonth || day.events.length)
      )
      .flat();

  return `
    <section class="season-month-group season-calendar-month season-calendar-month-grid">
      <div class="season-month-title">
        <span>${escapeHTML(monthLabel)}</span>
        <em>${monthEvents.length} race${monthEvents.length === 1 ? "" : "s"}</em>
      </div>
      <div class="season-calendar-weekdays" aria-hidden="true">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          .map(day => `<span>${day}</span>`)
          .join("")}
      </div>
      <div class="season-calendar-grid">
        ${visibleWeeks.map(day => `
          <div class="season-calendar-cell ${day.inMonth ? "" : "is-outside-month"} ${day.events.length ? "has-race" : ""}">
            <span class="season-calendar-cell-date">${day.date.getDate()}</span>
            <div class="season-calendar-cell-events">
              ${day.events.slice(0, 2).map(event =>
                renderSeasonCalendarEventPill(event, closeWarnings)
              ).join("")}
              ${day.events.length > 2
                ? `<span class="season-calendar-more">+${day.events.length - 2} more</span>`
                : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSeasonListEvent(event, closeWarnings, favoriteEvents) {
  const eventDate =
    parseSeasonDate(event.date);

  const dayLabel =
    eventDate
      ? String(eventDate.getDate()).padStart(2, "0")
      : "--";

  const raceLoad =
    getSeasonRaceLoad(event);

  const priority =
    getSeasonPriority(event);

  return `
    <div
      class="season-calendar-race-card ${priority === "A" ? "season-event-a-race" : ""} ${isCloseRaceEvent(event, closeWarnings) ? "season-event-close-warning" : ""}"
      data-season-open="${escapeHTML(getEventKey(event))}"
      data-event-key="${escapeHTML(getEventKey(event))}"
      role="button"
      tabindex="0"
    >
      <span class="season-calendar-day">${escapeHTML(dayLabel)}</span>
      <span class="season-event-main">
        <strong>${escapeHTML(event.event_name)}</strong>
        <em>${escapeHTML(getEventFormatLabel(event))} · ${escapeHTML(getSeasonDisplayDistance(event))}</em>
      </span>
      <span class="season-event-place">${escapeHTML(event.city)}, ${escapeHTML(event.country)}</span>
      <span class="season-load-badge season-load-${raceLoad.level.toLowerCase().replace(/\s+/g, "-")}">
        ${escapeHTML(getSeasonPlanningLoadLabel(raceLoad.level))}
      </span>
      <span class="season-priority-badge">${escapeHTML(getSeasonPriorityLabel(priority))}</span>
      <span class="season-gap-badge">${escapeHTML(getSeasonPreviousGapLabel(event, favoriteEvents))}</span>
      <button
        type="button"
        class="season-google-event"
        data-season-google="${escapeHTML(getEventKey(event))}"
      >
        Calendar
      </button>
      <button
        type="button"
        class="season-remove-event"
        data-season-remove="${escapeHTML(getEventKey(event))}"
        aria-label="Remove ${escapeHTML(event.event_name)} from Season Planner"
        title="Remove from Season"
      >
        X
      </button>
    </div>
  `;
}

function createLocalSeasonDate(year, month, day, hours = 8, minutes = 0, seconds = 0) {
  const date =
    new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
      0
    );

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function parseSeasonDateRange(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { start: null, end: null }
      : {
          start: new Date(value.getTime()),
          end: new Date(value.getTime())
        };
  }

  const text =
    cleanValue(value);

  if (!text) {
    return {
      start: null,
      end: null
    };
  }

  const dates = [];
  const germanPattern =
    /(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/g;
  const isoPattern =
    /\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/g;
  let match = null;

  while ((match = germanPattern.exec(text)) !== null) {
    dates.push(
      createLocalSeasonDate(
        match[3],
        match[2],
        match[1],
        match[4] || 8,
        match[5] || 0,
        match[6] || 0
      )
    );
  }

  while ((match = isoPattern.exec(text)) !== null) {
    dates.push(
      createLocalSeasonDate(
        match[1],
        match[2],
        match[3],
        match[4] || 8,
        match[5] || 0,
        match[6] || 0
      )
    );
  }

  const validDates =
    dates.filter(Boolean);

  if (!validDates.length) {
    return {
      start: null,
      end: null
    };
  }

  const start =
    validDates[0];
  const end =
    validDates[validDates.length - 1] < start
      ? start
      : validDates[validDates.length - 1];

  return {
    start,
    end
  };
}

function parseSeasonDate(value) {
  return parseSeasonDateRange(value).start;
}

function parseSeasonEndDate(value) {
  const range =
    parseSeasonDateRange(value);

  return range.end || range.start;
}

function getLocalDateStart(date) {
  if (!date) {
    return null;
  }

  const next =
    new Date(date.getTime());

  next.setHours(0, 0, 0, 0);
  return next;
}

function getSeasonDayDifferenceFromToday(value) {
  const date =
    parseSeasonDate(value);

  if (!date) {
    return null;
  }

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return Math.round(
    (getLocalDateStart(date).getTime() - today.getTime()) /
    (1000 * 60 * 60 * 24)
  );
}

function getUpcomingSeasonEvents(favoriteEvents) {
  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return favoriteEvents.filter(event => {
    const date =
      parseSeasonEndDate(event.date);

    return date && date >= today;
  }).sort((first, second) =>
    parseSeasonDate(first.date).getTime() -
    parseSeasonDate(second.date).getTime()
  );
}

function getSeasonCalendarView() {
  return localStorage.getItem("seasonCalendarView") === "list"
    ? "list"
    : "month";
}

function setSeasonCalendarView(view) {
  localStorage.setItem(
    "seasonCalendarView",
    view === "list" ? "list" : "month"
  );

  renderSeasonPlanner();
}

function getSeasonCalendarMonthIndex(monthGroups, upcomingEvents) {
  if (!monthGroups.length) {
    return 0;
  }

  const storedIndex =
    Number(localStorage.getItem("seasonCalendarMonthIndex"));

  if (
    Number.isInteger(storedIndex) &&
    storedIndex >= 0 &&
    storedIndex < monthGroups.length
  ) {
    return storedIndex;
  }

  const nextEvent =
    upcomingEvents[0];

  const nextMonth =
    nextEvent
      ? getSeasonMonthLabel(nextEvent)
      : "";

  const nextIndex =
    monthGroups.findIndex(([monthLabel]) =>
      monthLabel === nextMonth
    );

  return nextIndex >= 0
    ? nextIndex
    : 0;
}

function setSeasonCalendarMonthIndex(index) {
  localStorage.setItem(
    "seasonCalendarMonthIndex",
    String(Math.max(0, index))
  );

  renderSeasonPlanner();
}

function getSeasonPreviousGapLabel(event, sortedEvents) {
  const index =
    sortedEvents.findIndex(item =>
      getEventKey(item) === getEventKey(event)
    );

  if (index <= 0) {
    return "Season start";
  }

  const previousDate =
    parseSeasonDate(sortedEvents[index - 1].date);

  const currentDate =
    parseSeasonDate(event.date);

  if (!previousDate || !currentDate) {
    return "Gap unclear";
  }

  return `${getDaysBetweenDates(previousDate, currentDate)} days gap`;
}

function formatCountdown(targetDate) {
  if (!targetDate) {
    return window.t
      ? window.t("season.noUpcoming")
      : "No saved upcoming event";
  }

  const diff =
    targetDate.getTime() - Date.now();

  if (diff <= 0) {
    return "Today";
  }

  const totalSeconds =
    Math.floor(diff / 1000);

  const days =
    Math.floor(totalSeconds / 86400);

  const hours =
    Math.floor((totalSeconds % 86400) / 3600);

  const minutes =
    Math.floor((totalSeconds % 3600) / 60);

  const seconds =
    totalSeconds % 60;

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function getCountdownParts(targetDate) {
  if (!targetDate) {
    return null;
  }

  const diff =
    targetDate.getTime() - Date.now();

  if (diff <= 0) {
    return null;
  }

  const totalSeconds =
    Math.floor(diff / 1000);

  return [
    {
      value: Math.floor(totalSeconds / 86400),
      label: "d"
    },
    {
      value: Math.floor((totalSeconds % 86400) / 3600),
      label: "h"
    },
    {
      value: Math.floor((totalSeconds % 3600) / 60),
      label: "m"
    },
    {
      value: totalSeconds % 60,
      label: "s"
    }
  ];
}

function renderCountdownParts(targetDate) {
  const parts =
    getCountdownParts(targetDate);

  if (!parts) {
    return escapeHTML(formatCountdown(targetDate));
  }

  return parts
    .map(part => `
      <span class="countdown-unit">
        <span class="countdown-number">${part.label === "d" ? part.value : String(part.value).padStart(2, "0")}</span>
        <span class="countdown-label">${part.label}</span>
      </span>
    `)
    .join("");
}

function getNextSeasonEvent() {
  const favoriteEvents =
    getFavoriteEventsForSeason();

  return getUpcomingSeasonEvents(favoriteEvents)[0] || null;
}

function updateSeasonCountdown() {
  const countdown =
    document.getElementById("seasonCountdown");

  const nextName =
    document.getElementById("seasonNextEventName");

  const nextPlace =
    document.getElementById("seasonNextPlace");

  if (!countdown || !nextName) {
    return;
  }

  const nextEvent =
    getNextSeasonEvent();

  const nextDate =
    nextEvent
      ? parseSeasonDate(nextEvent.date)
      : null;

  const countdownMarkup =
    renderCountdownParts(nextDate);

  if (countdown.dataset.renderedValue !== countdownMarkup) {
    countdown.innerHTML =
      countdownMarkup;
    countdown.dataset.renderedValue =
      countdownMarkup;
  }

  const nextNameText =
    nextEvent
      ? nextEvent.event_name
      : window.t
        ? window.t("season.noSavedHint")
        : "Save events with the heart button to build your season.";

  if (nextName.textContent !== nextNameText) {
    nextName.textContent =
      nextNameText;
  }

  if (nextPlace) {
    const nextPlaceText =
      nextEvent
        ? `${nextEvent.city}, ${nextEvent.country}`
        : "-";

    if (nextPlace.textContent !== nextPlaceText) {
      nextPlace.textContent =
        nextPlaceText;
    }
  }
}

async function canOpenSeasonPlanner() {
  if (
    typeof supabaseClient === "undefined" ||
    !supabaseClient.auth
  ) {
    return false;
  }

  const {
    data,
    error
  } = await supabaseClient.auth.getUser();

  return !error && Boolean(data && data.user);
}

function renderSeasonEventList(
  favoriteEvents,
  selectedKey,
  closeWarnings
) {
  if (!favoriteEvents.length) {
    return `
      <div class="season-empty">
        <strong>No planned races yet</strong>
        <span>Save events from the map to build your editable season.</span>
      </div>
    `;
  }

  const sortByDateAsc = (first, second) => {
      const firstDate =
        parseSeasonDate(first.date);
      const secondDate =
        parseSeasonDate(second.date);

      if (!firstDate && !secondDate) {
        return cleanValue(first.event_name)
          .localeCompare(cleanValue(second.event_name));
      }

      if (!firstDate) {
        return 1;
      }

      if (!secondDate) {
        return -1;
      }

      return firstDate - secondDate;
    };
  const sortByDateDesc = (first, second) =>
    sortByDateAsc(second, first);
  const upcomingEvents =
    favoriteEvents
      .filter(event => !isSeasonEventPast(event))
      .sort(sortByDateAsc);
  const nextRaceKey =
    upcomingEvents[0]
      ? getEventKey(upcomingEvents[0])
      : "";
  const groupedEvents = [
    {
      title: "Upcoming",
      events: upcomingEvents
    },
    {
      title: "Completed",
      events:
        favoriteEvents
          .filter(event => {
            const details =
              getSeasonPlannerDetailsForEvent(event);

            return isSeasonEventPast(event) &&
              !(details.post_race?.archived === true ||
                details.post_race?.archived === "true");
          })
          .sort(sortByDateDesc)
    },
    {
      title: "Archive",
      events:
        favoriteEvents
          .filter(event => {
            const details =
              getSeasonPlannerDetailsForEvent(event);

            return isSeasonEventPast(event) &&
              (details.post_race?.archived === true ||
                details.post_race?.archived === "true");
          })
          .sort(sortByDateDesc)
    }
  ].filter(group => group.events.length);

  const renderSelector = event => {
    const eventKey =
      getEventKey(event);
    const priority =
      getSeasonPriority(event);
    const details =
      getSeasonPlannerDetailsForEvent(event);
    const isPast =
      isSeasonEventPast(event);
    const daysUntil =
      getSeasonDaysUntil(event);
    const timingLabel =
      daysUntil === null
        ? "Kein Datum"
        : daysUntil === 0
          ? "Heute"
          : daysUntil > 0
            ? `${daysUntil} Tage`
            : `Vor ${Math.abs(daysUntil)} Tagen`;
    const postStatus =
      isPast
        ? getSeasonPostRaceStatus(details)
        : "";
    const result =
      details.result || {};
    const taskSummary =
      getSeasonWorkspaceTaskSummary(event, details);
    const isNextRace =
      !isPast && eventKey === nextRaceKey;
    const compactDate =
      cleanValue(event.date || "--");
    const place =
      [event.city, event.country]
        .map(cleanValue)
        .filter(Boolean)
        .join(", ") || "Ort offen";
    const resultStatus =
      result.finish_status
        ? getSeasonFinishStatusLabel(result.finish_status)
        : postStatus;

    return `
      <button
        type="button"
        class="season-event-selector ${eventKey === selectedKey ? "active" : ""} ${!isPast && isCloseRaceEvent(event, closeWarnings) ? "has-warning" : ""} ${isPast ? "is-past-event" : ""} ${isNextRace ? "is-next-race" : ""} ${details.post_race?.archived ? "is-archived-event" : ""}"
        data-season-edit="${escapeHTML(eventKey)}"
        data-testid="planner-event-card"
        aria-pressed="${eventKey === selectedKey ? "true" : "false"}"
      >
        <span class="season-event-selector-date">${escapeHTML(compactDate)}</span>
        <span class="season-event-selector-main">
          ${isNextRace ? `<small>Next Race</small>` : ""}
          <strong>${escapeHTML(event.event_name)}</strong>
          <em>${escapeHTML(place)} · ${escapeHTML(getEventFormatLabel(event))}</em>
        </span>
        <span class="season-event-selector-meta">
          <b class="season-priority-badge season-priority-${priority.toLowerCase().replace(/\s+/g, "-")}">${escapeHTML(getSeasonPriorityLabel(priority))}</b>
          ${isPast ? `
            <b class="season-post-status-badge season-post-status-${postStatus.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${escapeHTML(postStatus)}</b>
            ${result.finish_time ? `<b>${escapeHTML(result.finish_time)}</b>` : ""}
            ${resultStatus && resultStatus !== postStatus ? `<b>${escapeHTML(resultStatus)}</b>` : ""}
          ` : `
            <b>${escapeHTML(timingLabel)}</b>
            ${taskSummary.open.length ? `<b>${escapeHTML(taskSummary.open.length)} ${taskSummary.open.length === 1 ? "Aufgabe" : "Aufgaben"} offen</b>` : `<b>Planung bereit</b>`}
          `}
        </span>
      </button>
    `;
  };

  return `
    <div class="season-event-selector-list">
      ${groupedEvents.map(group => `
        <section class="season-event-selector-group">
          <span>${escapeHTML(group.title)}</span>
          ${group.events.map(renderSelector).join("")}
        </section>
      `).join("")}
    </div>
  `;
}

function getSeasonWorkspaceTaskSummary(event, details = {}) {
  if (isSeasonEventPast(event)) {
    const result = details.result || {};
    const finishStatus = cleanValue(result.finish_status);
    const tasks = [
      {
        key: "result",
        label: "Ergebnis eingetragen",
        done: hasSeasonResult(result)
      },
      {
        key: "finish_status",
        label: "Finish Status gesetzt",
        done: Boolean(finishStatus)
      },
      {
        key: "rating",
        label: "Persönliche Bewertung ergänzt",
        done: Boolean(cleanValue(result.personal_rating))
      },
      {
        key: "reflection",
        label: "Rennreview abgeschlossen",
        done: hasSeasonReflection(result)
      }
    ];
    const done = tasks.filter(task => task.done);
    const open = tasks.filter(task => !task.done);

    return {
      tasks,
      done,
      open,
      total: tasks.length
    };
  }

  const goals = details.goals || {};
  const logistics = details.logistics || {};
  const daysUntil = getSeasonDaysUntil(event);
  const priority = getSeasonPriority(event);
  const goalStatus = getSeasonAreaStatus(
    details,
    "goals.goal_status",
    Boolean(cleanValue(goals.goal_type))
  );
  const bibStatus = getSeasonAreaStatus(
    details,
    "logistics.bib_status",
    Boolean(cleanValue(logistics.bib_number))
  );
  const tasks = [
    {
      key: "date",
      label: "Eventdatum vorhanden",
      done: Boolean(parseSeasonDate(event.date))
    },
    {
      key: "distance",
      label: "Distanz festgelegt",
      done: Boolean(cleanValue(getSeasonDisplayDistance(event)))
    },
    {
      key: "priority",
      label: "Priorität festgelegt",
      done: ["A", "B", "C", "Training"].includes(priority)
    },
    {
      key: "registration",
      label: "Anmeldung abgeschlossen",
      done: Boolean(logistics.registration_confirmed)
    },
    {
      key: "goal",
      label: "Rennziel gewählt",
      done:
        goalStatus === "not_needed" ||
        Boolean(cleanValue(goals.goal_type))
    }
  ];

  if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 42) {
    tasks.push({
      key: "bib",
      label: "Race Guide und Startunterlagen geprüft",
      done:
        bibStatus === "done" ||
        bibStatus === "not_needed"
    });
  }

  const relevant = tasks.filter(task => !task.notNeeded);
  const done = relevant.filter(task => task.done);
  const open = relevant.filter(task => !task.done);

  return {
    tasks,
    done,
    open,
    total: relevant.length
  };
}

function getSeasonWorkspaceNextAction(event, details = {}) {
  const goals = details.goals || {};
  const logistics = details.logistics || {};
  const equipment = details.equipment || {};
  const nutrition = details.nutrition || {};
  const result = details.result || {};
  const eventKey = getEventKey(event);
  const isPast = isSeasonEventPast(event);
  const daysUntil = getSeasonDaysUntil(event);

  if (isPast) {
    if (!hasSeasonResult(result)) {
      return {
        title: "Ergebnis eintragen",
        description: "Halte Finish Status, offizielle Zeit und Platzierung für deinen Saisonrückblick fest.",
        label: "Ergebnis eintragen",
        panelKey: `result-review:${eventKey}`,
        action: "result"
      };
    }

    if (!hasSeasonReflection(result)) {
      return {
        title: "Rennen kurz reflektieren",
        description: "Notiere, was gut lief und was du beim nächsten Rennen anders machen möchtest.",
        label: "Review ergänzen",
        panelKey: `result-review:${eventKey}`,
        action: "result"
      };
    }

    return {
      title: "Keine offenen Schritte",
      description: "Ergebnis und Rennreview sind vollständig dokumentiert.",
      label: "",
      panelKey: "",
      action: ""
    };
  }

  if (!["A", "B", "C", "Training"].includes(getSeasonPriority(event))) {
    return {
      title: "Eventpriorität festlegen",
      description: "Ordne das Rennen als A-, B-, C- oder Trainingsrennen ein.",
      label: "Event bearbeiten",
      action: "edit"
    };
  }

  if (!logistics.registration_confirmed) {
    return {
      title: "Anmeldung abschließen",
      description: "Prüfe den Meldestatus, bevor du weitere Reise- oder Rennplanung festlegst.",
      label: "Anmeldung prüfen",
      panelKey: `preparation:${eventKey}`,
      action: "panel"
    };
  }

  if (!cleanValue(goals.goal_type)) {
    return {
      title: "Persönliches Rennziel festlegen",
      description: "Lege fest, ob du auf Zeit, als Training oder einfach zum Spaß startest.",
      label: "Ziel festlegen",
      panelKey: `goal-strategy:${eventKey}`,
      action: "panel"
    };
  }

  const bibStatus = normalizeSeasonAreaStatus(logistics.bib_status);
  if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 42 && bibStatus === "open") {
    return {
      title: "Race Guide und Startunterlagen prüfen",
      description: "Kontrolliere Ausgabe, Pflichtunterlagen und wichtige Zeiten für den Renntag.",
      label: "Vorbereitung öffnen",
      panelKey: `preparation:${eventKey}`,
      action: "panel"
    };
  }

  if (
    daysUntil !== null &&
    daysUntil >= 0 &&
    daysUntil <= 42 &&
    normalizeSeasonAreaStatus(equipment.status) === "open"
  ) {
    return {
      title: "Ausrüstung planen",
      description: "Prüfe die automatisch vorgeschlagene Packliste für dieses Event.",
      label: "Equipment öffnen",
      panelKey: `equipment-nutrition:${eventKey}`,
      action: "panel"
    };
  }

  if (
    daysUntil !== null &&
    daysUntil >= 0 &&
    daysUntil <= 42 &&
    normalizeSeasonAreaStatus(nutrition.status) === "open"
  ) {
    return {
      title: "Verpflegungsstrategie erstellen",
      description: "Lege fest, ob und wie du dich während des Rennens verpflegen möchtest.",
      label: "Verpflegung planen",
      panelKey: `equipment-nutrition:${eventKey}`,
      action: "panel"
    };
  }

  return {
    title: "Planung vollständig",
    description: "Alle aktuell wichtigen Punkte für dieses Rennen sind geklärt.",
    label: "",
    panelKey: "",
    action: ""
  };
}

function getSeasonWorkspaceNotice(event) {
  if (isSeasonEventPast(event)) {
    return "Vergangene Planungsdaten bleiben in den Bereichen weiterhin erreichbar.";
  }

  const eventKey = getEventKey(event);
  const warning = getCloseRaceWarnings(
    getUpcomingSeasonEvents(getFavoriteEventsForSeason())
  ).find(item =>
    getEventKey(item.previous) === eventKey ||
    getEventKey(item.current) === eventKey
  );

  if (!warning) {
    return "";
  }

  const bothARaces =
    getSeasonPriority(warning.previous) === "A" &&
    getSeasonPriority(warning.current) === "A";
  const prefix = bothARaces
    ? "Zwei A-Races liegen nah beieinander. "
    : "Kurzer Rennabstand: ";

  return `${prefix}Zwischen ${warning.previous.event_name} und ${warning.current.event_name} liegen ${warning.daysBetween} Tage.`;
}

function renderSeasonEventEditPanel(event, eventKey) {
  const distanceOptions = getSeasonDistanceOptions(event);
  const plannedDistance = getSeasonPlannedDistance(event);
  const priority = getSeasonPriority(event);
  const removeTitle = seasonPlannerText(
    "season.removeFromSeason",
    "Event aus dem Season Planner entfernen"
  );

  return `
    <div class="season-workspace-edit-panel" data-testid="planner-event-edit-form">
      <div class="season-workspace-edit-fields">
        <label class="season-distance-control">
          <span>${escapeHTML(seasonPlannerText("season.plannedDistance", "Distanz"))}</span>
          <select data-season-distance="${escapeHTML(eventKey)}" data-testid="planner-distance-select">
            <option value="">${escapeHTML(seasonPlannerText("season.eventDefault", "Eventangabe verwenden"))}</option>
            ${distanceOptions.map(distance => `
              <option value="${escapeHTML(distance)}" ${plannedDistance === distance ? "selected" : ""}>${escapeHTML(distance)}</option>
            `).join("")}
          </select>
        </label>
        <label class="season-priority-control">
          <span>${escapeHTML(seasonPlannerText("season.racePriority", "Priorität"))}</span>
          <select data-season-priority="${escapeHTML(eventKey)}" data-testid="planner-priority-select">
            ${["A", "B", "C", "Training", "Maybe"].map(value => `
              <option value="${value}" ${priority === value ? "selected" : ""}>${escapeHTML(getSeasonPriorityLabel(value))}</option>
            `).join("")}
          </select>
        </label>
      </div>
      <div class="season-workspace-edit-actions">
        <span>Änderungen werden automatisch gespeichert.</span>
        <button type="button" class="season-edit-done" data-season-edit-done="${escapeHTML(eventKey)}">Fertig</button>
        <button
          type="button"
          class="season-priority-remove-event season-priority-remove-icon"
          data-season-remove="${escapeHTML(eventKey)}"
          data-testid="planner-remove-event"
          aria-label="${escapeHTML(removeTitle)}: ${escapeHTML(event.event_name)}"
          title="${escapeHTML(removeTitle)}"
        >
          <svg class="season-trash-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z"></path>
            <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function renderSeasonRaceWorkspace(event, eventKey) {
  const details = getSeasonPlannerDetailsForEvent(event);
  const goals = details.goals || {};
  const logistics = details.logistics || {};
  const equipment = details.equipment || {};
  const nutrition = details.nutrition || {};
  const result = details.result || {};
  const summary = getSeasonResultSummaryItems(event, goals, result);
  const taskSummary = getSeasonWorkspaceTaskSummary(event, details);
  const nextAction = getSeasonWorkspaceNextAction(event, details);
  const isPast = isSeasonEventPast(event);
  const hasResult = hasSeasonResult(result);
  const distanceKm = summary.distanceKm;
  const distanceLabel = Number.isFinite(distanceKm)
    ? `${distanceKm.toFixed(distanceKm % 1 ? 2 : 0)} km`
    : "";
  const resultMetricLabel = summary.sportType === "cycling"
    ? "Avg speed"
    : summary.sportType === "swimming"
      ? "Pace / 100 m"
      : "Pace";
  const targetMetricValue = summary.sportType === "triathlon"
    ? ""
    : summary.targetMetric.value;
  const finishMetricValue = summary.sportType === "triathlon"
    ? ""
    : summary.finishMetric.value;
  const priority = getSeasonPriority(event);
  const trainingPhase = isPast ? "Completed" : getSeasonTrainingPhase(event);
  const timingLabel = isPast
    ? getSeasonPostRaceStatus(details)
    : getSeasonTimingLabel(event);
  const place = [event.city, event.country]
    .map(cleanValue)
    .filter(Boolean)
    .join(", ") || "Ort offen";
  const goalSummary = [
    goals.goal_type ? getSeasonGoalTypeLabel(goals.goal_type) : "Noch kein Zieltyp gewählt",
    goals.target_time ? `Zielzeit ${goals.target_time}` : "",
    cleanValue(goals.race_strategy) ? "Strategie notiert" : ""
  ].filter(Boolean).join(" · ");
  const preparationSummary = [
    logistics.registration_confirmed ? "Angemeldet" : "Anmeldung offen",
    normalizeSeasonAreaStatus(logistics.bib_status) === "done" ? "Startunterlagen geklärt" : ""
  ].filter(Boolean).join(" · ");
  const travelStatus = normalizeSeasonAreaStatus(logistics.travel_status, logistics.travel_booked ? "done" : "open");
  const accommodationStatus = normalizeSeasonAreaStatus(logistics.accommodation_status, logistics.accommodation_booked ? "done" : "open");
  const travelSummary = [
    travelStatus === "not_needed" ? "Keine Reise nötig" : travelStatus === "done" ? "Anreise geklärt" : "Anreise offen",
    accommodationStatus === "not_needed" ? "Keine Unterkunft nötig" : accommodationStatus === "done" ? "Unterkunft geklärt" : "Unterkunft offen"
  ].join(" · ");
  const equipmentStatus = normalizeSeasonAreaStatus(equipment.status);
  const nutritionStatus = normalizeSeasonAreaStatus(nutrition.status);
  const equipmentSummary = [
    equipmentStatus === "not_needed" ? "Ausrüstung nicht benötigt" : equipmentStatus === "done" || equipmentStatus === "planned" ? "Ausrüstung geplant" : "Ausrüstung offen",
    nutritionStatus === "not_needed" || cleanValue(nutrition.type) === "not_needed" ? "Verpflegung nicht benötigt" : nutritionStatus === "done" || nutritionStatus === "planned" ? "Verpflegung geplant" : "Verpflegung offen"
  ].join(" · ");
  const resultSummary = hasResult
    ? [
        result.finish_status ? getSeasonFinishStatusLabel(result.finish_status) : "",
        result.finish_time ? `Finish ${result.finish_time}` : "",
        result.age_group_place ? `AK ${result.age_group_place}` : ""
      ].filter(Boolean).join(" · ")
    : isPast
      ? "Ergebnis noch nicht eingetragen"
      : "Nach dem Rennen verfügbar";
  const notice = getSeasonWorkspaceNotice(event);
  const editOpen = seasonEditingEventKey === eventKey;
  const resultPanelMarkup = renderSeasonDetailPanel({
    title: "Result & Review",
    summary: resultSummary,
    open: isPast && (!hasResult || !hasSeasonReflection(result)),
    tone: isPast ? "" : "is-future-result",
    panelKey: `result-review:${eventKey}`,
    body: `
      ${renderSeasonResultPanel({
        event,
        eventKey,
        result,
        summary,
        distanceLabel,
        finishMetricValue,
        goalDelta: summary.goalDelta,
        hasResult
      })}
      ${isPast ? renderSeasonArchiveAction(eventKey, details.post_race || {}) : ""}
    `
  });

  return `
    <div class="season-race-workspace ${isPast ? "is-past-race" : ""}">
      <header class="season-workspace-header">
        <div class="season-workspace-heading">
          <span>${escapeHTML(event.date || "Datum offen")}</span>
          <h3>${escapeHTML(event.event_name)}</h3>
          <p>${escapeHTML(place)} · ${escapeHTML(event.sport || getSeasonSportLabel(summary.sportType))} · ${escapeHTML(getSeasonDisplayDistance(event) || "Distanz offen")}</p>
          <div class="season-workspace-badges">
            <b class="season-priority-badge season-priority-${priority.toLowerCase().replace(/\s+/g, "-")}">${escapeHTML(getSeasonPriorityLabel(priority))}</b>
            <b>${escapeHTML(timingLabel)}</b>
            <b>${escapeHTML(trainingPhase)}</b>
            <b>${logistics.registration_confirmed ? "Angemeldet" : "Anmeldung offen"}</b>
          </div>
        </div>
        <button
          type="button"
          class="season-event-edit-button"
          data-season-toggle-edit="${escapeHTML(eventKey)}"
          data-testid="planner-event-edit-button"
          aria-expanded="${editOpen ? "true" : "false"}"
        >
          ${editOpen ? "Bearbeitung schließen" : "Event bearbeiten"}
        </button>
      </header>

      ${editOpen ? renderSeasonEventEditPanel(event, eventKey) : ""}

      <section class="season-next-action-card ${nextAction.action ? "has-action" : "is-complete"}" data-testid="planner-next-action">
        <span>Nächster Schritt</span>
        <div>
          <strong>${escapeHTML(nextAction.title)}</strong>
          <p>${escapeHTML(nextAction.description)}</p>
        </div>
        ${nextAction.label ? `
          <button
            type="button"
            data-season-next-action="${escapeHTML(nextAction.action)}"
            data-season-next-panel="${escapeHTML(nextAction.panelKey || "")}"
            data-season-next-event="${escapeHTML(eventKey)}"
          >${escapeHTML(nextAction.label)}</button>
        ` : ""}
      </section>

      <section class="season-task-progress" aria-label="Planungsstand">
        <div>
          <strong>${escapeHTML(taskSummary.done.length)} von ${escapeHTML(taskSummary.total)} wichtigen Punkten erledigt</strong>
          <span>${taskSummary.open.length ? `${taskSummary.open.length} ${taskSummary.open.length === 1 ? "Punkt ist" : "Punkte sind"} noch offen.` : "Alle aktuell relevanten Punkte sind geklärt."}</span>
        </div>
        <div class="season-task-list">
          ${taskSummary.tasks.map(task => `
            <span class="${task.done ? "is-done" : "is-open"}"><b aria-hidden="true">${task.done ? "✓" : "○"}</b>${escapeHTML(task.label)}</span>
          `).join("")}
        </div>
      </section>

      ${notice ? `<p class="season-workspace-notice">${escapeHTML(notice)}</p>` : ""}

      <div class="season-workspace-accordions">
        ${isPast ? resultPanelMarkup : ""}
        ${renderSeasonDetailPanel({
          title: "Goal & Race Strategy",
          summary: goalSummary,
          open: !isPast && !goals.goal_type,
          panelKey: `goal-strategy:${eventKey}`,
          body: `
            <div class="season-status-strip">
              ${renderSeasonStatusSelect({ eventKey, path: "goals.goal_status", label: "Ziel", value: goals.goal_status, doneLabel: "Geklärt" })}
              ${renderSeasonStatusSelect({ eventKey, path: "goals.strategy_status", label: "Race Strategy", value: goals.strategy_status, doneLabel: "Geplant" })}
            </div>
            ${renderSeasonGoalTypeControl(eventKey, goals)}
            ${renderSeasonGoalFields(eventKey, goals, targetMetricValue, resultMetricLabel)}
            <div class="season-detail-fields">
              ${renderSeasonPlannerTextarea({ eventKey, path: "goals.race_strategy", labelKey: "", fallback: "Pacing und Renntaktik", value: goals.race_strategy, placeholder: "Intensität, Pacing, Schlüsselstellen..." })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "personal_note", labelKey: "season.personalNote", fallback: "Persönliche Notiz", value: details.personal_note, placeholder: "Was möchtest du dir für dieses Rennen merken?", legacyNote: true })}
            </div>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Preparation",
          summary: preparationSummary,
          open: !isPast && !logistics.registration_confirmed,
          panelKey: `preparation:${eventKey}`,
          body: `
            <div class="season-detail-checks season-detail-checks-compact">
              ${renderSeasonPlannerCheckbox({ eventKey, path: "logistics.registration_confirmed", labelKey: "season.registrationConfirmed", fallback: "Anmeldung abgeschlossen", checked: logistics.registration_confirmed })}
            </div>
            <div class="season-detail-fields">
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.bib_status", label: "Race Guide & Startunterlagen", value: logistics.bib_status || (logistics.bib_number ? "done" : "open"), doneLabel: "Geprüft" })}
              ${renderSeasonStatusSelect({ eventKey, path: "preparation.medical_status", label: "Medizinische Bescheinigung", value: details.preparation?.medical_status || "not_needed", doneLabel: "Vorhanden" })}
              ${renderSeasonStatusSelect({ eventKey, path: "preparation.course_status", label: "Streckenkenntnis", value: details.preparation?.course_status || "open", doneLabel: "Geprüft" })}
              ${renderSeasonPlannerTextField({ eventKey, path: "logistics.bib_number", labelKey: "season.bibNumber", fallback: "Startnummer", value: logistics.bib_number, placeholder: "Optional" })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "preparation.note", labelKey: "", fallback: "Weitere Vorbereitung", value: details.preparation?.note, placeholder: "Race Guide, Pflichtausrüstung, eigene Punkte..." })}
            </div>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Travel & Logistics",
          summary: travelSummary,
          panelKey: `travel-logistics:${eventKey}`,
          body: `
            <div class="season-detail-fields">
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.travel_status", label: "Anreise", value: logistics.travel_status || (logistics.travel_booked ? "done" : "open"), doneLabel: "Geklärt" })}
              ${renderSeasonStatusSelect({ eventKey, path: "logistics.accommodation_status", label: "Unterkunft", value: logistics.accommodation_status || (logistics.accommodation_booked ? "done" : "open"), doneLabel: "Gebucht" })}
              ${renderSeasonPlannerTextField({ eventKey, path: "logistics.start_location", labelKey: "", fallback: "Startort", value: logistics.start_location, placeholder: "Ort oder Adresse" })}
              ${renderSeasonPlannerTextField({ eventKey, path: "logistics.parking", labelKey: "", fallback: "Parken / Transfer", value: logistics.parking, placeholder: "Optional" })}
              ${renderSeasonPlannerTextarea({ eventKey, path: "logistics.travel_note", labelKey: "season.travelNote", fallback: "Logistiknotiz", value: logistics.travel_note, placeholder: "Anreise, Ausgabe, Begleitpersonen, wichtige Uhrzeiten..." })}
            </div>
          `
        })}
        ${renderSeasonDetailPanel({
          title: "Equipment & Nutrition",
          summary: equipmentSummary,
          tone: "equipment",
          panelKey: `equipment-nutrition:${eventKey}`,
          body: `
            <section class="season-workspace-subsection">
              <h4>Equipment</h4>
              ${renderSeasonEquipmentChecklist(event, eventKey, equipment)}
            </section>
            <section class="season-workspace-subsection">
              <h4>Verpflegung</h4>
              ${renderSeasonNutritionPlanner(eventKey, nutrition)}
            </section>
          `
        })}
        ${!isPast ? resultPanelMarkup : ""}
      </div>
    </div>
  `;
}

function renderSeasonEditableEvent(event) {
  if (!event) {
    return `
      <div class="season-empty">
        <strong>Select a race</strong>
        <span>Choose a planned race on the left to edit goals, logistics, strategy and result data.</span>
      </div>
    `;
  }

  const eventKey =
    getEventKey(event);

  return `
    <article class="season-event-editor-card" data-testid="planner-event-edit-card">
      ${renderSeasonRaceWorkspace(event, eventKey)}
    </article>
  `;
}

function renderSeasonPlanner() {
  const favoriteEvents =
    getFavoriteEventsForSeason();

  const upcomingEvents =
    getUpcomingSeasonEvents(favoriteEvents);

  const nextEvent =
    upcomingEvents[0];

  const nextDate =
    nextEvent
      ? parseSeasonDate(nextEvent.date)
      : null;

  const savedCount =
    document.getElementById("seasonSavedCount");

  const upcomingCount =
    document.getElementById("seasonUpcomingCount");

  const nextDateElement =
    document.getElementById("seasonNextDate");

  const nextPlaceElement =
    document.getElementById("seasonNextPlace");

  const aRaceCount =
    document.getElementById("seasonARaceCount");

  const bRaceCount =
    document.getElementById("seasonBRaceCount");

  const cRaceCount =
    document.getElementById("seasonCRaceCount");

  const totalDistanceElement =
    document.getElementById("seasonTotalDistance");

  const countdown =
    document.getElementById("seasonCountdown");

  const nextName =
    document.getElementById("seasonNextEventName");

  const timeline =
    document.getElementById("seasonTimeline");

  const priorityList =
    document.getElementById("seasonPriorityList");

  const seasonEventList =
    document.getElementById("seasonEventList");

  const sportBreakdown =
    document.getElementById("seasonSportBreakdown");

  const scheduleWarnings =
    document.getElementById("seasonScheduleWarnings");

  const overviewARaces =
    document.getElementById("seasonOverviewARaces");

  const overviewWarnings =
    document.getElementById("seasonOverviewWarnings");

  const overviewSummary =
    document.getElementById("seasonOverviewSummary");

  const overviewSportMix =
    document.getElementById("seasonOverviewSportMix");

  const seasonScoreMetric =
    document.getElementById("seasonScoreMetric");

  const seasonScoreHeading =
    document.querySelector(
      ".season-score-kpi .season-score-heading > span"
    );

  const seasonTrainingOpportunity =
    document.getElementById("seasonTrainingOpportunity");

  const seasonTrainingBlock =
    document.getElementById("seasonTrainingBlock");

  const seasonRecommendedEvents =
    document.getElementById("seasonRecommendedEvents");

  const seasonCountdownCards =
    document.getElementById("seasonCountdownCards");

  const seasonTrainingBlocks =
    document.getElementById("seasonTrainingBlocks");

  if (!timeline) {
    return;
  }

  if (savedCount) {
    savedCount.textContent =
      String(favoriteEvents.length);
  }

  if (upcomingCount) {
    upcomingCount.textContent =
      String(upcomingEvents.length);
  }

  nextDateElement.textContent =
    nextEvent
      ? nextEvent.date
      : "-";

  if (nextPlaceElement) {
    nextPlaceElement.textContent =
      nextEvent
        ? `${nextEvent.city}, ${nextEvent.country}`
        : "-";
  }

  if (aRaceCount) {
    aRaceCount.textContent =
      String(
        favoriteEvents.filter(event =>
          getSeasonPriority(event) === "A"
        ).length
      );
  }

  updateSeasonCountdown();

  const sportCounts =
    getSeasonSportBreakdown(favoriteEvents);

  const prioritySummary =
    getSeasonPrioritySummary(favoriteEvents);

  const distanceMix =
    getSeasonDistanceMix(favoriteEvents);

  const totalPlannedDistance =
    favoriteEvents.reduce((sum, event) => {
      const distanceKm =
        getSeasonDistanceKm(event);

      return sum + (distanceKm || 0);
    }, 0);

  if (bRaceCount) {
    bRaceCount.textContent =
      String(prioritySummary.B);
  }

  if (cRaceCount) {
    cRaceCount.textContent =
      String(prioritySummary.C);
  }

  if (totalDistanceElement) {
    totalDistanceElement.textContent =
      totalPlannedDistance
        ? `${Math.round(totalPlannedDistance)} km`
        : "0 km";
  }

  const monthDensity =
    getMonthDensitySummary(favoriteEvents);

  const monthTimeline =
    getMonthDensityTimeline(favoriteEvents);

  const nextKeyRace =
    getNextKeyRace(favoriteEvents);

  sportBreakdown.innerHTML =
    Object.entries(sportCounts)
      .map(([label, count]) => `
        <div>
          <strong>${count}</strong>
          <span>${label}</span>
        </div>
      `)
      .join("");

  const closeWarnings =
    getCloseRaceWarnings(favoriteEvents);

  const loadSummary =
    getSeasonLoadSummary(
      favoriteEvents,
      closeWarnings
    );

  const seasonScore =
    getSeasonScoreSummary(
      favoriteEvents,
      closeWarnings,
      prioritySummary
    );

  const trainingOpportunity =
    getTrainingOpportunity(favoriteEvents);

  const longestTrainingBlock =
    getLongestTrainingBlock(favoriteEvents);

  const trainingBlocks =
    getSeasonTrainingBlocks(favoriteEvents);

  const importantCountdownEvents =
    getImportantCountdownEvents(favoriteEvents);

  const secondaryCountdownEvents =
    importantCountdownEvents.filter(event =>
      !nextEvent ||
      getEventKey(event) !== getEventKey(nextEvent)
    );

  const recommendedEvents =
    getRecommendedSeasonEvents(favoriteEvents);

  scheduleWarnings.innerHTML =
    closeWarnings.length
      ? closeWarnings
        .map(warning => `
          <div class="season-warning-item ${warning.severity === "high" ? "high" : ""}">
            <strong>${warning.daysBetween} days apart · ${warning.recommendedGap} recommended</strong>
            <span>${escapeHTML(warning.previous.event_name)} → ${escapeHTML(warning.current.event_name)}</span>
          </div>
        `)
        .join("")
      : `<p>${window.t ? window.t("season.noConflicts") : "No close race conflicts."}</p>`;

  if (!favoriteEvents.length) {
    timeline.innerHTML = `
      <div class="season-empty">
        <strong>${window.t ? window.t("season.noSaved") : "No saved events yet"}</strong>
        <span>Füge dein erstes Rennen hinzu.</span>
      </div>
    `;

    if (priorityList) {
      priorityList.innerHTML = `
        <div class="season-empty">
          <strong>No race selected</strong>
          <span>Füge dein erstes Rennen hinzu.</span>
        </div>
      `;
    }

    if (seasonEventList) {
      seasonEventList.innerHTML =
        renderSeasonEventList([], "", []);
    }

    seasonMobileEventDetailOpen = false;
    syncSeasonMobileEventView();

    if (overviewARaces) {
      overviewARaces.innerHTML =
        `<p>No A races selected yet.</p>`;
    }

    if (overviewWarnings) {
      overviewWarnings.innerHTML =
        `<p>${window.t ? window.t("season.noConflicts") : "No close race conflicts."}</p>`;
    }

    if (overviewSummary) {
      overviewSummary.innerHTML = `
        <div class="season-summary-empty">
          <strong>Build your season</strong>
          <span>Füge dein erstes Rennen hinzu.</span>
        </div>
      `;
    }

    if (overviewSportMix) {
      overviewSportMix.innerHTML =
        `<p>No sport mix yet.</p>`;
    }

    if (seasonScoreMetric) {
      seasonScoreMetric.innerHTML = `
        <strong>0 / 100</strong>
        <em class="season-score-badge season-score-caution">Start planning</em>
        <p>Save races to calculate your season score.</p>
      `;
    }

    if (seasonTrainingOpportunity) {
      seasonTrainingOpportunity.innerHTML = `
        <div class="season-decision-empty">
          <strong>-</strong>
          <em>Select an A-Race</em>
          <p>Select an A-Race to unlock this metric.</p>
        </div>
      `;
    }

    if (seasonTrainingBlock) {
      seasonTrainingBlock.innerHTML = `
        <div class="season-decision-empty">
          <strong>-</strong>
          <em>More races needed</em>
          <p>Add more races to analyse training blocks.</p>
        </div>
      `;
    }

    if (seasonRecommendedEvents) {
      seasonRecommendedEvents.innerHTML = `
        <div class="season-empty">
          <strong>No recommendations yet</strong>
          <span>Save your first race to unlock event recommendations.</span>
        </div>
      `;
    }

    if (seasonCountdownCards) {
      seasonCountdownCards.innerHTML = `
        <div class="season-empty">
          <strong>No countdowns yet</strong>
          <span>Save upcoming races to see your next important starts.</span>
        </div>
      `;
    }

    if (seasonTrainingBlocks) {
      seasonTrainingBlocks.innerHTML = "";
    }

    return;
  }

  const selectedEventKey =
    getSelectedSeasonEventKey(favoriteEvents);
  const selectedEvent =
    favoriteEvents.find(event =>
      getEventKey(event) === selectedEventKey
    ) || favoriteEvents[0];

  if (seasonEventList) {
    seasonEventList.innerHTML =
      renderSeasonEventList(
        favoriteEvents,
        getEventKey(selectedEvent),
        closeWarnings
      );
  }

  if (priorityList) {
    priorityList.innerHTML =
      renderSeasonEditableEvent(selectedEvent);
  }

  syncSeasonMobileEventView();

  const seasonCalendarView =
    getSeasonCalendarView();

  timeline.className =
    `season-calendar-view season-calendar-view-${seasonCalendarView}`;

  document
    .querySelectorAll("[data-season-calendar-view]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.seasonCalendarView === seasonCalendarView
      );
    });

  const monthGroups =
    Object.entries(
      groupSeasonEventsByMonth(favoriteEvents)
    );

  const scheduledMonthGroups =
    monthGroups.filter(([monthLabel]) =>
      monthLabel !== "Unscheduled"
    );

  const activeMonthIndex =
    getSeasonCalendarMonthIndex(
      scheduledMonthGroups,
      upcomingEvents
    );

  const activeMonthGroup =
    scheduledMonthGroups[activeMonthIndex];

  timeline.innerHTML =
    seasonCalendarView === "month"
      ? `
        <div class="season-calendar-month-toolbar">
          <button
            type="button"
            data-season-month-nav="${activeMonthIndex - 1}"
            ${activeMonthIndex <= 0 ? "disabled" : ""}
            aria-label="Previous month"
          >
            Previous
          </button>
          <div>
            <span>${escapeHTML(activeMonthGroup ? activeMonthGroup[0] : "No scheduled races")}</span>
            <em>${
              activeMonthGroup
                ? `${activeMonthGroup[1].length} race${activeMonthGroup[1].length === 1 ? "" : "s"}`
                : "Add dated races to build your calendar"
            }</em>
          </div>
          <button
            type="button"
            data-season-month-nav="${activeMonthIndex + 1}"
            ${activeMonthIndex >= scheduledMonthGroups.length - 1 ? "disabled" : ""}
            aria-label="Next month"
          >
            Next
          </button>
        </div>
        ${
          activeMonthGroup
            ? renderSeasonMonthCalendar(
              activeMonthGroup[0],
              activeMonthGroup[1],
              closeWarnings
            )
            : `
              <div class="season-empty">
                <strong>No scheduled races</strong>
                <span>Add dated races to build your calendar.</span>
              </div>
            `
        }
      `
      : monthGroups
        .map(([monthLabel, monthEvents]) => `
            <section class="season-month-group season-calendar-month">
              <div class="season-month-title">
                <span>${escapeHTML(monthLabel)}</span>
                <em>${monthEvents.length} race${monthEvents.length === 1 ? "" : "s"}</em>
              </div>
              <div class="season-calendar-events">
                ${monthEvents.map(event =>
                  renderSeasonListEvent(
                    event,
                    closeWarnings,
                    favoriteEvents
                  )
                ).join("")}
              </div>
            </section>
          `)
        .join("");

  if (seasonCountdownCards) {
    seasonCountdownCards.innerHTML =
      secondaryCountdownEvents.length
        ? `
          <div class="season-countdown-grid">
            ${secondaryCountdownEvents.map(event => {
              const days =
                getDaysUntilSeasonEvent(event);

              return `
                <button
                  type="button"
                  class="season-countdown-card"
                  data-season-open="${escapeHTML(getEventKey(event))}"
                >
                  <span>${escapeHTML(getSeasonPriorityLabel(getSeasonPriority(event)))}</span>
                  <strong>${days === null ? "-" : days}</strong>
                  <em>days to ${escapeHTML(event.event_name)}</em>
                  <small>${escapeHTML(event.date)} · ${escapeHTML(event.city)}, ${escapeHTML(event.country)} · ${escapeHTML(getEventFormatLabel(event))}</small>
                </button>
              `;
            }).join("")}
          </div>
        `
        : `
          <div class="season-empty">
            <strong>No additional countdowns yet</strong>
            <span>Add more upcoming races to compare your next starts.</span>
          </div>
        `;
  }

  if (overviewARaces) {
    const aRaces =
      favoriteEvents.filter(event =>
        getSeasonPriority(event) === "A"
      );

    overviewARaces.innerHTML =
      aRaces.length
        ? aRaces.slice(0, 4).map(event => `
          <button
            type="button"
            class="season-overview-mini-event"
            data-season-open="${escapeHTML(getEventKey(event))}"
          >
            <span>${escapeHTML(event.date)}</span>
            <strong>${escapeHTML(event.event_name)}</strong>
            <em>${escapeHTML(event.city)}</em>
          </button>
        `).join("")
        : `<p>No A races selected yet.</p>`;
  }

  if (overviewWarnings) {
    overviewWarnings.innerHTML =
      closeWarnings.length
        ? closeWarnings.slice(0, 3).map(warning => `
          <div class="season-warning-item ${warning.severity === "high" ? "high" : ""}">
            <strong>${warning.daysBetween} days apart · ${warning.recommendedGap} recommended</strong>
            <span>${escapeHTML(warning.previous.event_name)} → ${escapeHTML(warning.current.event_name)}</span>
          </div>
        `).join("")
        : `<p>${window.t ? window.t("season.noConflicts") : "No close race conflicts."}</p>`;
  }

  if (overviewSummary) {
    const range =
      getSeasonDateRange(favoriteEvents);

    const averageGap =
      getAverageDaysBetweenEvents(favoriteEvents);

    const busiestMonth =
      getBusiestSeasonMonth(favoriteEvents);

    const recoveryRiskLabel =
      closeWarnings.length
        ? `${closeWarnings.length} warning${closeWarnings.length === 1 ? "" : "s"}`
        : "Clear";

    const balanceText =
      closeWarnings.length
        ? "Review races with short recovery windows before committing."
        : "Your saved races currently have no obvious spacing conflicts.";

    overviewSummary.innerHTML = `
      <div class="season-orientation-panel">
        <div class="season-orientation-main">
          <div class="season-balance-heading">
            <span>Season Balance</span>
            <button
              type="button"
              id="seasonBalanceInfoBtn"
              class="season-score-info-btn"
              title="Click for more information"
              aria-label="Click for more information about Season Balance"
            >
              i
            </button>
          </div>
          <strong>${escapeHTML(loadSummary.label)}</strong>
          <p>${escapeHTML(balanceText)}</p>
          <div
            class="season-balance-meter"
            style="--balance-color: ${loadSummary.color}; --balance-percent: ${loadSummary.percent}%"
            aria-label="Season Balance: ${escapeHTML(loadSummary.label)} at ${loadSummary.percent} percent"
          >
            <span></span>
          </div>
        </div>

        <div class="season-orientation-list">
          <div>
            <span>Saved races</span>
            <strong>${favoriteEvents.length}</strong>
            <em>${upcomingEvents.length} upcoming</em>
          </div>
          <div>
            <span>Average spacing</span>
            <strong>${averageGap ? `${averageGap} days` : "-"}</strong>
            <em>${escapeHTML(recoveryRiskLabel)}</em>
          </div>
          <div>
            <span>Season window</span>
            <strong>${
              range
                ? `${range.first.toLocaleDateString("en-US", { month: "short" })} - ${range.last.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
                : "-"
            }</strong>
            <em>${busiestMonth ? `Busiest: ${escapeHTML(busiestMonth[0])}` : "Add dates to compare months"}</em>
          </div>
          <div>
            <span>Next focus</span>
            <strong>${nextKeyRace ? escapeHTML(nextKeyRace.event_name) : "-"}</strong>
            <em>${nextKeyRace ? `${escapeHTML(getSeasonPriorityLabel(getSeasonPriority(nextKeyRace)))} · ${escapeHTML(nextKeyRace.date)}` : "Set an A or B race"}</em>
          </div>
        </div>
      </div>
    `;
  }

  if (overviewSportMix) {
    const sportTotal =
      Object.values(sportCounts)
        .reduce((sum, count) => sum + count, 0);

    const sportEntries =
      Object.entries(sportCounts)
        .filter(([, count]) => count > 0)
        .sort((first, second) => second[1] - first[1]);

    const dominantSport =
      sportEntries[0] || ["No focus", 0];

    const dominantPercent =
      getPercent(dominantSport[1], sportTotal);

    const mixInsight =
      !sportTotal
        ? "Add races to see your season focus."
        : sportEntries.length === 1
          ? `Single-sport season focused on ${dominantSport[0].toLowerCase()}.`
          : dominantPercent >= 70
            ? `${dominantSport[0]} clearly dominates your season.`
            : "Your season is balanced across multiple sport types.";

    const sportColors = {
      Running: "#22c55e",
      Triathlon: "#38bdf8",
      Ultra: "#a78bfa"
    };

    const distanceEntries =
      Object.entries(distanceMix)
        .filter(([, count]) => count > 0)
        .sort((first, second) => second[1] - first[1]);

    const maxDistanceCount =
      Math.max(
        1,
        ...Object.values(distanceMix)
      );

    overviewSportMix.innerHTML =
      `
        <div class="season-race-mix-panel">
          <div class="season-race-mix-header">
            <div>
              <span>Race Mix</span>
              <strong>${sportTotal ? `${dominantSport[0]} focus` : "No race mix yet"}</strong>
              <em>${escapeHTML(mixInsight)}</em>
            </div>
            <button
              type="button"
              id="sportMixInfoBtn"
              class="season-score-info-btn"
              title="Click for more information"
              aria-label="Click for more information about Race Mix"
            >
              i
            </button>
          </div>

          <div class="season-race-mix-body">
            <div class="season-donut-card season-race-focus-card">
              <div
                class="season-donut"
                style="--sport-gradient: ${buildSportMixGradient(sportCounts)}"
              >
                <strong>${sportTotal}</strong>
                <em>Races</em>
              </div>
              <div>
                <span>Season focus</span>
                <strong>${sportTotal ? `${dominantPercent}% ${dominantSport[0]}` : "No races yet"}</strong>
                <p>${escapeHTML(mixInsight)}</p>
              </div>
            </div>

            <div class="season-mix-bars">
              <span>Sport distribution</span>
              ${sportEntries
                .map(([label, count]) => `
                  <div class="season-mix-row" style="--mix-color: ${sportColors[label] || "#94a3b8"}">
                    <em>${escapeHTML(label)}</em>
                    <div><span style="width: ${getPercent(count, sportTotal)}%"></span></div>
                    <strong>${count}</strong>
                  </div>
                `)
                .join("") || "<p>No sport distribution yet.</p>"}
            </div>

            <div class="season-mix-bars season-distance-focus">
              <span>Distance focus</span>
              ${distanceEntries
                .slice(0, 5)
                .map(([label, count]) => `
                  <div class="season-mix-row" style="--mix-color: #86efac">
                    <em>${escapeHTML(label)}</em>
                    <div><span style="width: ${Math.round((count / maxDistanceCount) * 100)}%"></span></div>
                    <strong>${count}</strong>
                  </div>
                `)
                .join("") || "<p>No distance focus yet.</p>"}
            </div>
          </div>
        </div>
      `;
  }

  if (seasonScoreMetric) {
    if (seasonScoreHeading) {
      seasonScoreHeading.textContent =
        "Season Score";
    }

    seasonScoreMetric.innerHTML = `
      <strong>${seasonScore.score} / 100</strong>
      <em class="season-score-badge season-score-${seasonScore.className}">
        ${escapeHTML(seasonScore.label)}
      </em>
      <p>${escapeHTML(seasonScore.explanation)}</p>
    `;
  }

  if (seasonTrainingOpportunity) {
    seasonTrainingOpportunity.innerHTML =
      trainingOpportunity
        ? `
          <div class="season-decision-value">
            <strong>${trainingOpportunity.days} Days</strong>
            <em>Until next A-Race</em>
          </div>
          <p>${escapeHTML(trainingOpportunity.phase)}</p>
          <span>${escapeHTML(trainingOpportunity.text)}</span>
          <button
            type="button"
            class="season-open-event season-decision-link"
            data-season-open="${escapeHTML(getEventKey(trainingOpportunity.event))}"
          >
            Open ${escapeHTML(trainingOpportunity.event.event_name)}
          </button>
        `
        : `
          <div class="season-decision-empty">
            <strong>-</strong>
            <em>Select an A-Race</em>
            <p>Select an A-Race to unlock this metric.</p>
          </div>
        `;
  }

  if (seasonTrainingBlock) {
    seasonTrainingBlock.innerHTML =
      longestTrainingBlock
        ? `
          <div class="season-decision-value season-training-hero">
            <div class="season-training-hero-heading">
              <span>Longest gap</span>
              <button
                type="button"
                class="season-score-info-btn"
                data-training-block-info
                title="Click for more information"
                aria-label="Click for more information about Training Blocks"
              >
                i
              </button>
            </div>
            <strong>${longestTrainingBlock.days} Days</strong>
            <em>Largest time gap between two upcoming planned races</em>
          </div>
          <div class="season-training-route">
            <span>Between</span>
            <strong>${escapeHTML(longestTrainingBlock.previous.event_name)}</strong>
            <i aria-hidden="true">→</i>
            <strong>${escapeHTML(longestTrainingBlock.current.event_name)}</strong>
          </div>
          <p class="season-training-summary">Best opportunity for focused training.</p>
        `
        : `
          <div class="season-decision-empty">
            <strong>-</strong>
            <em>More races needed</em>
            <p>Add at least two upcoming races to analyse training blocks.</p>
          </div>
        `;
  }

  if (seasonTrainingBlocks) {
    seasonTrainingBlocks.innerHTML =
      trainingBlocks.length
        ? `
          <div class="season-training-block-list">
            ${trainingBlocks.slice(0, 5).map(block => `
              <div class="season-training-block-item season-training-block-${block.level}">
                <strong>${block.days} days</strong>
                <span>${escapeHTML(block.label)}</span>
                <em>${escapeHTML(block.previous.event_name)} → ${escapeHTML(block.current.event_name)}</em>
                <p>${escapeHTML(block.text)}</p>
              </div>
            `).join("")}
          </div>
        `
        : "";
  }

  if (seasonRecommendedEvents) {
    seasonRecommendedEvents.innerHTML =
      recommendedEvents.length
        ? `
          <div class="season-recommendation-grid">
            ${recommendedEvents.map(event => `
              <div class="season-recommendation-card">
                <span>${escapeHTML(event.date)}</span>
                <strong>${escapeHTML(event.event_name)}</strong>
                <em>${escapeHTML(event.city)}, ${escapeHTML(event.country)}</em>
                <p>${escapeHTML(getSeasonDisplayDistance(event))}</p>
                <small>${escapeHTML(event._seasonRecommendationReason || "Based on your current season.")}</small>
                <button
                  type="button"
                  data-season-recommend="${escapeHTML(getEventKey(event))}"
                >
                  Add to Season
                </button>
              </div>
            `).join("")}
          </div>
          <small>Based on your current season.</small>
        `
        : `
          <div class="season-empty">
            <strong>No recommendations found</strong>
            <span>Add more races or vary sport, distance and timing to improve recommendations.</span>
          </div>
        `;
  }

  document
    .querySelectorAll("[data-season-priority]")
    .forEach(select => {
      select.addEventListener("change", () => {
        setSeasonPriority(
          select.dataset.seasonPriority,
          select.value
        );

        if (typeof trackEvent === "function") {
          trackEvent("planner_priority_changed", {
            event_id: select.dataset.seasonPriority,
            priority: select.value
          });
        }

        renderSeasonPlannerPreservingView();
      });
    });

  document
    .querySelectorAll("[data-season-distance]")
    .forEach(select => {
      select.addEventListener("change", () => {
        setSeasonPlannedDistance(
          select.dataset.seasonDistance,
          select.value
        );

        if (typeof trackEvent === "function") {
          trackEvent("planned_distance_changed", {
            event_id: select.dataset.seasonDistance,
            distance_selected: select.value
          });
        }

        renderSeasonPlannerPreservingView();
      });
    });

  document
    .querySelectorAll("[data-season-note]")
    .forEach(textarea => {
      textarea.addEventListener("change", () => {
        setSeasonNote(
          textarea.dataset.seasonNote,
          textarea.value
        );

        if (typeof trackEvent === "function") {
          trackEvent("personal_note_added_or_updated", {
            event_id: textarea.dataset.seasonNote,
            has_note:
              Boolean(textarea.value.trim())
          });
        }

        if (typeof showToast === "function") {
          showToast(
            "Season note saved",
            "Your personal race note was updated."
          );
        }
      });
    });

  document
    .querySelectorAll("[data-season-detail-field]")
    .forEach(field => {
      field.addEventListener("change", () => {
        const eventKey =
          field.dataset.seasonDetailEvent;
        const path =
          field.dataset.seasonDetailField;
        const value =
          field.type === "checkbox"
            ? field.checked
            : field.value;

        setSeasonPlannerDetailField(
          eventKey,
          path,
          value
        );

        if (typeof trackEvent === "function") {
          trackEvent("planner_detail_updated", {
            event_id: eventKey,
            field: path
          });
        }

        if (typeof showToast === "function") {
          showToast(
            seasonPlannerText("season.detailsSaved", "Planner details saved"),
            seasonPlannerText("season.detailsSavedCopy", "Your event details were updated.")
          );
        }

        renderSeasonPlannerPreservingView();
      });
    });

  document
    .querySelectorAll("[data-season-time-part]")
    .forEach(input => {
      const saveSeasonTimeParts = (shouldRender = false) => {
        const eventKey =
          input.dataset.seasonTimeEvent;
        const path =
          input.dataset.seasonTimeField;
        const relatedInputs =
          document.querySelectorAll(
            `[data-season-time-event="${CSS.escape(eventKey)}"][data-season-time-field="${CSS.escape(path)}"]`
          );
        const parts = {
          hours: 0,
          minutes: 0,
          seconds: 0
        };

        relatedInputs.forEach(partInput => {
          const part =
            partInput.dataset.seasonTimePart;
          const rawValue =
            Number(partInput.value || 0);

          parts[part] =
            Number.isFinite(rawValue)
              ? Math.max(0, rawValue)
              : 0;
        });

        parts.minutes =
          Math.min(59, parts.minutes);
        parts.seconds =
          Math.min(59, parts.seconds);

        if (shouldRender) {
          relatedInputs.forEach(partInput => {
            const part =
              partInput.dataset.seasonTimePart;

            partInput.value =
              parts[part] > 0 || part !== "hours"
                ? String(parts[part]).padStart(part === "hours" ? 1 : 2, "0")
                : "";
          });
        }

        const totalSeconds =
          parts.hours * 3600 +
          parts.minutes * 60 +
          parts.seconds;

        setSeasonPlannerDetailField(
          eventKey,
          path,
          totalSeconds > 0
            ? formatSeasonDuration(totalSeconds)
            : ""
        );

        if (typeof trackEvent === "function") {
          trackEvent("planner_detail_updated", {
            event_id: eventKey,
            field: path
          });
        }

        if (typeof showToast === "function") {
          showToast(
            seasonPlannerText("season.detailsSaved", "Planner details saved"),
            seasonPlannerText("season.detailsSavedCopy", "Your event details were updated.")
          );
        }

        if (shouldRender) {
          renderSeasonPlannerPreservingView();
        }
      };

      input.addEventListener("input", () => {
        window.clearTimeout(seasonTimeInputSaveTimer);
        seasonTimeInputSaveTimer =
          window.setTimeout(
            () => saveSeasonTimeParts(false),
            240
          );
      });

      input.addEventListener("change", () => {
        window.clearTimeout(seasonTimeInputSaveTimer);
        saveSeasonTimeParts(true);
      });
    });

  document
    .querySelectorAll("[data-season-calendar-view]")
    .forEach(button => {
      button.addEventListener("click", () => {
        setSeasonCalendarView(
          button.dataset.seasonCalendarView
        );
      });
    });

  document
    .querySelectorAll("[data-season-month-nav]")
    .forEach(button => {
      button.addEventListener("click", () => {
        if (button.disabled) {
          return;
        }

        setSeasonCalendarMonthIndex(
          Number(button.dataset.seasonMonthNav)
        );

        if (typeof trackEvent === "function") {
          trackEvent("calendar_month_changed", {
            month_index:
              Number(button.dataset.seasonMonthNav)
          });
        }
      });
    });

  document
    .querySelectorAll("[data-season-edit]")
    .forEach(button => {
      button.addEventListener("click", () => {
        if (usesSeasonListDetailNavigation()) {
          const listPanel =
            button.closest(".season-events-list-panel");

          seasonEventsListScrollTop =
            listPanel?.scrollTop || 0;
          seasonMobileEventDetailOpen = true;

          if (!history.state?.seasonPlannerDetail) {
            history.pushState(
              {
                ...(history.state || {}),
                seasonPlannerDetail: true
              },
              "",
              window.location.href
            );
          }
        }

        writeSelectedSeasonEventKey(
          button.dataset.seasonEdit
        );

        renderSeasonPlannerPreservingView("events");

        if (usesSeasonListDetailNavigation()) {
          window.requestAnimationFrame(() => {
            const scrollContainer =
              getSeasonPlannerScrollContainer();

            if (scrollContainer) {
              scrollContainer.scrollTop = 0;
            }
          });
        }
      });
    });

  document
    .querySelectorAll("[data-season-toggle-edit]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const eventKey =
          button.dataset.seasonToggleEdit;

        seasonEditingEventKey =
          seasonEditingEventKey === eventKey
            ? ""
            : eventKey;
        renderSeasonPlannerPreservingView("events");
      });
    });

  document
    .querySelectorAll("[data-season-edit-done]")
    .forEach(button => {
      button.addEventListener("click", () => {
        seasonEditingEventKey = "";
        renderSeasonPlannerPreservingView("events");
      });
    });

  document
    .querySelectorAll("[data-season-next-action]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const action =
          button.dataset.seasonNextAction;
        const eventKey =
          button.dataset.seasonNextEvent;
        const panelKey =
          button.dataset.seasonNextPanel;

        if (action === "edit") {
          seasonEditingEventKey = eventKey;
        }

        if (panelKey) {
          seasonOpenDetailPanels.add(panelKey);
        }

        if (action === "result") {
          setSeasonPlannerDetailField(
            eventKey,
            "result.edit_mode",
            true
          );
        }

        renderSeasonPlannerPreservingView("events");

        window.requestAnimationFrame(() => {
          if (action === "edit") {
            document
              .querySelector("[data-testid='planner-event-edit-form'] select")
              ?.focus({ preventScroll: true });
            return;
          }

          const panel = panelKey
            ? document.querySelector(
                `[data-season-detail-panel="${CSS.escape(panelKey)}"]`
              )
            : null;

          panel?.querySelector("summary")?.focus({ preventScroll: true });
          panel?.scrollIntoView({ block: "nearest" });
        });
      });
    });

  document
    .querySelectorAll("[data-season-goal-type]")
    .forEach(button => {
      button.addEventListener("click", () => {
        setSeasonPlannerDetailField(
          button.dataset.seasonGoalEvent,
          "goals.goal_type",
          button.dataset.seasonGoalType
        );
        setSeasonPlannerDetailField(
          button.dataset.seasonGoalEvent,
          "goals.goal_status",
          "done"
        );
        renderSeasonPlannerPreservingView("events");
      });
    });

  document
    .querySelectorAll("[data-season-result-edit]")
    .forEach(button => {
      button.addEventListener("click", () => {
        setSeasonPlannerDetailField(
          button.dataset.seasonResultEdit,
          "result.edit_mode",
          true
        );
        renderSeasonPlannerPreservingView("events");
      });
    });

  document
    .querySelectorAll("[data-season-result-close]")
    .forEach(button => {
      button.addEventListener("click", () => {
        setSeasonPlannerDetailField(
          button.dataset.seasonResultClose,
          "result.edit_mode",
          false
        );
        renderSeasonPlannerPreservingView("events");
      });
    });

  document
    .querySelectorAll("[data-season-archive]")
    .forEach(button => {
      button.addEventListener("click", () => {
        setSeasonPlannerDetailField(
          button.dataset.seasonArchive,
          "post_race.archived",
          button.dataset.seasonArchiveValue === "true"
        );
        renderSeasonPlannerPreservingView("events");
      });
    });

  bindSeasonDetailPanelState();
  bindSeasonEquipmentInteractions();

  document
    .querySelectorAll("[data-season-nutrition-add]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const eventKey =
          button.dataset.seasonNutritionAdd;
        const form =
          document.querySelector(
            `[data-season-nutrition-form="${CSS.escape(eventKey)}"]`
          );

        if (!form) {
          return;
        }

        const entry = {
          stage: cleanValue(form.querySelector("[data-season-nutrition-stage]")?.value),
          trigger: cleanValue(form.querySelector("[data-season-nutrition-trigger]")?.value),
          product: cleanValue(form.querySelector("[data-season-nutrition-product]")?.value),
          amount: cleanValue(form.querySelector("[data-season-nutrition-amount]")?.value),
          fluid: cleanValue(form.querySelector("[data-season-nutrition-fluid]")?.value),
          note: cleanValue(form.querySelector("[data-season-nutrition-note]")?.value)
        };

        if (!Object.values(entry).some(Boolean)) {
          return;
        }

        const details =
          getSeasonPlannerDetails(eventKey);
        const nutrition =
          normalizePlannerDetails(details).nutrition;

        setSeasonPlannerDetailField(
          eventKey,
          "nutrition",
          {
            ...nutrition,
            status: "planned",
            entries:
              [...(nutrition.entries || []), entry]
          }
        );
        renderSeasonPlannerPreservingView("events");
      });
    });

  document
    .querySelectorAll("[data-season-nutrition-delete]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const eventKey =
          button.dataset.seasonNutritionEvent;
        const index =
          Number(button.dataset.seasonNutritionDelete);
        const details =
          getSeasonPlannerDetails(eventKey);
        const nutrition =
          normalizePlannerDetails(details).nutrition;

        setSeasonPlannerDetailField(
          eventKey,
          "nutrition",
          {
            ...nutrition,
            entries:
              (nutrition.entries || []).filter((_, itemIndex) => itemIndex !== index)
          }
        );
        renderSeasonPlannerPreservingView("events");
      });
    });

  document
    .querySelectorAll("[data-season-open]")
    .forEach(button => {
      button.addEventListener("click", event => {
        if (event.target.closest("[data-season-google], [data-season-remove]")) {
          return;
        }

        const key =
          button.dataset.seasonOpen;

        const found =
          favoriteEvents.find(event =>
            getEventKey(event) === key
          );

        if (!found) {
          return;
        }

        document
          .getElementById("seasonPlannerModal")
          .classList.remove("open");

        if (typeof window.preparePlatformDiscoveryForEvent === "function") {
          window.preparePlatformDiscoveryForEvent();
        }

        if (typeof focusEvent === "function") {
          focusEvent(found);
        }

        openDrawer(found);
      });

      button.addEventListener("keydown", event => {
        if (event.target.closest("[data-season-google], [data-season-remove]")) {
          return;
        }

        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        event.preventDefault();
        button.click();
      });
    });

  document
    .querySelectorAll("[data-season-remove]")
    .forEach(button => {
      button.addEventListener("click", event => {
        event.stopPropagation();

        const found =
          favoriteEvents.find(event =>
            getEventKey(event) ===
            button.dataset.seasonRemove
          );

        if (!found) {
          return;
        }

        const confirmed =
          window.confirm(
            `${cleanValue(found.event_name) || "Dieses Event"} aus dem Season Planner entfernen?`
          );

        if (!confirmed) {
          return;
        }

        toggleFavorite(found);
      });
    });

  document
    .querySelectorAll("[data-season-google]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const found =
          favoriteEvents.find(event =>
            getEventKey(event) ===
            button.dataset.seasonGoogle
          );

        if (!found) {
          return;
        }

        const url =
          buildGoogleCalendarUrl(found);

        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      });
    });

  document
    .querySelectorAll("[data-season-recommend]")
    .forEach(button => {
      button.addEventListener("click", () => {
        const found =
          recommendedEvents.find(event =>
            getEventKey(event) ===
            button.dataset.seasonRecommend
          );

        if (!found) {
          return;
        }

        if (typeof trackEvent === "function") {
          trackEvent("recommendation_clicked", {
            event_id: button.dataset.seasonRecommend,
            source: "season_planner"
          });
        }

        toggleFavorite(found);
      });
    });
}

function formatIcsDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
}

function escapeIcsText(value) {
  return cleanValue(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function exportSeasonCalendar() {
  const favoriteEvents =
    getFavoriteEventsForSeason();

  if (!favoriteEvents.length) {
    if (typeof showAppMessage === "function") {
      showAppMessage(
        "No saved events",
        "Save events with the heart button before exporting your calendar."
      );
    }

    return;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sport Event Map//Season Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  favoriteEvents.forEach(event => {
    const startDate =
      parseSeasonDate(event.date);

    if (!startDate) {
      return;
    }

    const endDate =
      new Date(startDate);

    endDate.setDate(endDate.getDate() + 1);

    const key =
      getEventKey(event);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(key)}@sport-event-map`,
      `DTSTAMP:${formatIcsDate(new Date())}T000000Z`,
      `DTSTART;VALUE=DATE:${formatIcsDate(startDate)}`,
      `DTEND;VALUE=DATE:${formatIcsDate(endDate)}`,
      `SUMMARY:${escapeIcsText(event.event_name)}`,
      `LOCATION:${escapeIcsText(`${event.city}, ${event.country}`)}`,
      `DESCRIPTION:${escapeIcsText(`${getEventFormatLabel(event)} · ${event.distance} · ${event.event_url || ""}`)}`,
      event.event_url ? `URL:${escapeIcsText(event.event_url)}` : "",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");

  const blob =
    new Blob(
      [lines.filter(Boolean).join("\r\n")],
      { type: "text/calendar;charset=utf-8" }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = "sport-event-map-season.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);

  if (typeof trackEvent === "function") {
    trackEvent("calendar_exported", {
      format: "ics",
      event_count: favoriteEvents.length
    });
  }

  if (typeof showToast === "function") {
    showToast(
      "Calendar ready",
      "Your season calendar file was downloaded."
    );
  }
}

function buildGoogleCalendarUrl(event) {
  const startDate =
    parseSeasonDate(event.date);

  if (!startDate) {
    return "";
  }

  const endDate =
    new Date(startDate);

  endDate.setDate(endDate.getDate() + 1);

  const details = [
    getEventFormatLabel(event),
    cleanValue(event.distance),
    cleanValue(event.event_url)
  ].filter(Boolean).join(" · ");

  const params =
    new URLSearchParams({
      action: "TEMPLATE",
      text: cleanValue(event.event_name),
      dates: `${formatIcsDate(startDate)}/${formatIcsDate(endDate)}`,
      details,
      location: [
        cleanValue(event.city),
        cleanValue(event.country)
      ].filter(Boolean).join(", ")
    });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function addNextRaceToGoogleCalendar() {
  const nextEvent =
    getNextSeasonEvent();

  if (!nextEvent) {
    if (typeof showAppMessage === "function") {
      showAppMessage(
        "No upcoming race",
        "Save an upcoming event with the heart button before adding it to Google Calendar."
      );
    }

    return;
  }

  const url =
    buildGoogleCalendarUrl(nextEvent);

  if (!url) {
    if (typeof showAppMessage === "function") {
      showAppMessage(
        "Calendar export unavailable",
        "This event has no valid date, so it cannot be opened in Google Calendar."
      );
    }

    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");

  if (typeof trackEvent === "function") {
    trackEvent("calendar_exported", {
      format: "google_calendar",
      event_id: getEventKey(nextEvent)
    });
  }
}

function setSeasonTab(tabName) {
  document
    .querySelectorAll(".season-tab")
    .forEach(tab => {
      const isActive =
        tab.dataset.seasonTab === tabName;

      tab.classList.toggle("active", isActive);
      tab.setAttribute(
        "aria-selected",
        isActive ? "true" : "false"
      );
      tab.tabIndex = isActive ? 0 : -1;
    });

  document
    .querySelectorAll(".season-tab-panel")
    .forEach(panel => {
      const isActive =
        panel.id === `season${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}Panel`;

      panel.classList.toggle("active", isActive);
      panel.hidden = !isActive;
    });

  syncSeasonMobileEventView();
}

async function openSeasonPlanner() {
  let isSignedIn = false;

  try {
    isSignedIn =
      await canOpenSeasonPlanner();
  } catch (error) {
    console.warn(
      "Season Planner auth check failed",
      error
    );
  }

  if (!isSignedIn) {
    if (typeof showAppMessage === "function") {
      showAppMessage(
        "Login required",
        "Please log in to open your season planner and manage your saved race calendar."
      );
    }

    return;
  }

  const plannerModal =
    document.getElementById("seasonPlannerModal");

  if (!plannerModal) {
    console.warn(
      "Season Planner modal not found"
    );
    return;
  }

  const isPlannerRoute =
    String(window.location.hash || "")
      .startsWith("#/planner");

  if (!isPlannerRoute) {
    window.location.hash = "/planner";
    return;
  }

  const plannerMount =
    document.getElementById("plannerPageMount");

  if (
    plannerMount &&
    plannerModal.parentElement !== plannerMount
  ) {
    plannerMount.appendChild(plannerModal);
  }

  plannerModal.classList.add(
    "season-planner-page-mode"
  );

  document.body.classList.add(
    "season-planner-page-open"
  );

  plannerModal.classList.add("open");

  const activeTab =
    document.querySelector(".season-tab.active")
      ?.dataset.seasonTab || "overview";

  setSeasonTab(activeTab);

  if (typeof trackEvent === "function") {
    trackEvent("season_planner_opened", {
      saved_events:
        getFavoriteEventsForSeason().length
    });
  }

  try {
    renderSeasonPlanner();
  } catch (error) {
    console.error(
      "Season Planner render failed",
      error
    );

    if (typeof showToast === "function") {
      showToast(
        "Season Planner could not refresh. Please try again."
      );
    }
  }

  if (seasonCountdownTimer) {
    clearInterval(seasonCountdownTimer);
  }

  seasonCountdownTimer =
    setInterval(updateSeasonCountdown, 1000);
}

function closeSeasonPlanner() {
  const plannerModal =
    document.getElementById("seasonPlannerModal");

  if (plannerModal) {
    plannerModal.classList.remove(
      "open",
      "season-planner-page-mode"
    );
  }

  document.body.classList.remove(
    "season-planner-page-open"
  );

  if (seasonCountdownTimer) {
    clearInterval(seasonCountdownTimer);
    seasonCountdownTimer = null;
  }
}

function initSeasonPlanner() {
  const openButton =
    document.getElementById("seasonPlannerBtn");

  const closeButton =
    document.getElementById("closeSeasonPlanner");

  const exportButton =
    document.getElementById("exportSeasonCalendarBtn");

  const googleButton =
    document.getElementById("addNextRaceGoogleBtn");

  const scoreInfoButton =
    document.getElementById("seasonScoreInfoBtn");

  const scoreInfoModal =
    document.getElementById("seasonScoreInfoModal");

  const closeScoreInfoButton =
    document.getElementById("closeSeasonScoreInfo");

  document
    .querySelectorAll(".season-tab")
    .forEach(tab => {
      tab.addEventListener("click", () => {
        setSeasonTab(tab.dataset.seasonTab);
      });

      tab.addEventListener("keydown", event => {
        const tabs =
          Array.from(document.querySelectorAll(".season-tab"));
        const currentIndex =
          tabs.indexOf(tab);
        let nextIndex = currentIndex;

        if (event.key === "ArrowRight") {
          nextIndex = (currentIndex + 1) % tabs.length;
        } else if (event.key === "ArrowLeft") {
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          nextIndex = 0;
        } else if (event.key === "End") {
          nextIndex = tabs.length - 1;
        } else {
          return;
        }

        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setSeasonTab(nextTab.dataset.seasonTab);
        nextTab.focus();
      });
    });

  const eventsBackButton =
    document.getElementById("seasonEventsBackButton");

  eventsBackButton?.addEventListener("click", () => {
    if (history.state?.seasonPlannerDetail) {
      history.back();
      return;
    }

    closeSeasonMobileEventDetail();
  });

  window.addEventListener("popstate", event => {
    if (
      seasonMobileEventDetailOpen &&
      !event.state?.seasonPlannerDetail
    ) {
      closeSeasonMobileEventDetail();
    }
  });

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(syncSeasonMobileEventView);
  }, { passive: true });

  if (openButton) {
    openButton.addEventListener(
      "click",
      openSeasonPlanner
    );
  }

  if (closeButton) {
    closeButton.addEventListener(
      "click",
      closeSeasonPlanner
    );
  }

  if (exportButton) {
    exportButton.addEventListener(
      "click",
      exportSeasonCalendar
    );
  }

  if (googleButton) {
    googleButton.addEventListener(
      "click",
      addNextRaceToGoogleCalendar
    );
  }

  if (scoreInfoButton && scoreInfoModal) {
    scoreInfoButton.addEventListener("click", () => {
      scoreInfoModal.classList.add("open");
    });
  }

  if (closeScoreInfoButton && scoreInfoModal) {
    closeScoreInfoButton.addEventListener("click", () => {
      scoreInfoModal.classList.remove("open");
    });
  }

  if (scoreInfoModal) {
    scoreInfoModal.addEventListener("click", event => {
      if (event.target === scoreInfoModal) {
        scoreInfoModal.classList.remove("open");
      }
    });

    document.addEventListener("keydown", event => {
      if (
        event.key === "Escape" &&
        scoreInfoModal.classList.contains("open")
      ) {
        scoreInfoModal.classList.remove("open");
      }
    });
  }

  const infoModalMap = {
    seasonScoreInfoBtn: "seasonScoreInfoModal",
    seasonBalanceInfoBtn: "seasonBalanceInfoModal",
    sportMixInfoBtn: "sportMixInfoModal",
    trainingBlockInfoBtn: "trainingBlockInfoModal"
  };

  const closeInfoModalMap = {
    closeSeasonScoreInfo: "seasonScoreInfoModal",
    closeSeasonBalanceInfo: "seasonBalanceInfoModal",
    closeSportMixInfo: "sportMixInfoModal",
    closeTrainingBlockInfo: "trainingBlockInfoModal"
  };

  document.addEventListener("click", event => {
    const opener =
      event.target.closest(
        "#seasonScoreInfoBtn, #seasonBalanceInfoBtn, #sportMixInfoBtn, #trainingBlockInfoBtn, [data-training-block-info]"
      );

    if (opener) {
      document
        .getElementById(
          opener.dataset.trainingBlockInfo !== undefined
            ? "trainingBlockInfoModal"
            : infoModalMap[opener.id]
        )
        ?.classList.add("open");

      return;
    }

    const closer =
      event.target.closest(
        "#closeSeasonScoreInfo, #closeSeasonBalanceInfo, #closeSportMixInfo, #closeTrainingBlockInfo"
      );

    if (closer) {
      document
        .getElementById(closeInfoModalMap[closer.id])
        ?.classList.remove("open");
    }
  });

  [
    "seasonScoreInfoModal",
    "seasonBalanceInfoModal",
    "sportMixInfoModal",
    "trainingBlockInfoModal"
  ].forEach(modalId => {
    const modal =
      document.getElementById(modalId);

    if (!modal) {
      return;
    }

    modal.addEventListener("click", event => {
      if (event.target === modal) {
        modal.classList.remove("open");
      }
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") {
      return;
    }

    [
      "seasonScoreInfoModal",
      "seasonBalanceInfoModal",
      "sportMixInfoModal",
      "trainingBlockInfoModal"
    ].forEach(modalId => {
      document
        .getElementById(modalId)
        ?.classList.remove("open");
    });
  });
}

window.openSeasonPlanner =
  openSeasonPlanner;

window.closeSeasonPlanner =
  closeSeasonPlanner;

window.renderSeasonPlanner =
  renderSeasonPlanner;

initSeasonPlanner();
