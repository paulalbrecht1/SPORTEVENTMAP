if (typeof L === "undefined") {
  console.error(
    "Leaflet unavailable. Event list will load without the interactive map."
  );

  window.__leafletUnavailable = true;

  window.L = {
    icon() {
      return {};
    },
    divIcon() {
      return {};
    },
    layerGroup() {
      return {
        addLayer() {},
        clearLayers() {},
        getLayers() {
          return [];
        }
      };
    },
    markerClusterGroup() {
      return this.layerGroup();
    },
    map() {
      return {
        setView() {
          return this;
        },
        addLayer() {},
        removeLayer() {},
        fitBounds() {},
        flyTo() {},
        invalidateSize() {},
        on() {},
        closePopup() {},
        getZoom() {
          return 2;
        }
      };
    },
    tileLayer() {
      return {
        addTo() {},
        remove() {}
      };
    },
    marker(coords) {
      return {
        bindPopup() {
          return this;
        },
        on() {
          return this;
        },
        openPopup() {},
        getLatLng() {
          return {
            lat: coords?.[0] || 0,
            lng: coords?.[1] || 0
          };
        }
      };
    },
    circleMarker() {
      return {
        addTo() {}
      };
    },
    latLngBounds() {
      return {
        isValid() {
          return false;
        },
        extend() {}
      };
    },
    featureGroup() {
      return {
        getBounds() {
          return {};
        }
      };
    }
  };
}

let map;

let allMarkers = [];

let searchInitialized = false;

const DISCOVERY_DEFAULT_MAP_CENTER = [
  51.1657,
  10.4515
];

const DISCOVERY_DEFAULT_MAP_ZOOM = 6;

const DISCOVERY_DEFAULT_MAP_ZOOM_MOBILE = 5;

function getDiscoveryDefaultMapZoom() {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 640px)").matches
  ) {
    return DISCOVERY_DEFAULT_MAP_ZOOM_MOBILE;
  }

  return DISCOVERY_DEFAULT_MAP_ZOOM;
}

function resetDiscoveryMapView(options = {}) {
  if (
    typeof map === "undefined" ||
    !map
  ) {
    return;
  }

  const zoom =
    Number.isFinite(options.zoom)
      ? options.zoom
      : getDiscoveryDefaultMapZoom();

  if (
    options.animate &&
    typeof map.flyTo === "function"
  ) {
    map.flyTo(
      DISCOVERY_DEFAULT_MAP_CENTER,
      zoom,
      {
        duration: options.duration || 0.8
      }
    );
    return;
  }

  if (typeof map.setView === "function") {
    map.setView(
      DISCOVERY_DEFAULT_MAP_CENTER,
      zoom,
      {
        animate: false
      }
    );
  }
}

// MARKER CLUSTER
const MARKER_CLUSTER_OPTIONS = {
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: false,
  spiderfyOnEveryZoom: false,
  animate: false,
  animateAddingMarkers: false,
  disableClusteringAtZoom: 14,
  chunkedLoading: true,
  chunkInterval: 90,
  chunkDelay: 16,
  removeOutsideVisibleBounds: true,
  maxClusterRadius(zoom) {
    if (zoom >= 12) return 24;
    if (zoom >= 9) return 38;
    return 52;
  }
};

function createMarkerLayer() {
  if (
    typeof L.markerClusterGroup === "function"
  ) {
    return L.markerClusterGroup(
      MARKER_CLUSTER_OPTIONS
    );
  }

  console.warn(
    "MarkerCluster plugin unavailable. Falling back to normal Leaflet markers."
  );

  if (typeof L.layerGroup === "function") {
    return L.layerGroup();
  }

  return {
    addLayer() {},
    clearLayers() {},
    getLayers() {
      return [];
    }
  };
}

let markerLayer = createMarkerLayer();

let baseLayer;
let mapLayoutRefreshTimer;
let mapLayoutObserver;
let mapLayoutRefreshInitialized = false;
let eventsRefreshToken = 0;
let deferMarkerLayerUpdates = false;

const MAP_STYLES = {
  standard: {
    url:
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      attribution:
        "&copy; OpenStreetMap contributors",
      maxZoom: 19
    }
  },
  light: {
    url:
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: {
      attribution:
        "&copy; OpenStreetMap & CartoDB",
      maxZoom: 19
    }
  },
  outdoor: {
    url:
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      attribution:
        "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap",
      maxZoom: 17
    }
  }
};

// CUSTOM RED MARKER
const redIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",

  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",

  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// INIT MAP
function initMap() {
  map = L.map("map", {
    preferCanvas: true,
    zoomAnimation: true,
    markerZoomAnimation: false,
    fadeAnimation: false,
    wheelDebounceTime: 45,
    wheelPxPerZoomLevel: 90
  }).setView(
    DISCOVERY_DEFAULT_MAP_CENTER,
    getDiscoveryDefaultMapZoom()
  );

  if (window.__leafletUnavailable) {
    const mapElement =
      document.getElementById("map");

    if (mapElement) {
      mapElement.innerHTML = `
        <div class="map-unavailable">
          <strong>Map temporarily unavailable</strong>
          <span>The event database is loaded. Please refresh once the map library is available again.</span>
        </div>
      `;
    }
  }

  setMapStyle(
    localStorage.getItem("sportEventMap.mapStyle") ||
    "standard"
  );

  map.addLayer(markerLayer);

  setupMapLayoutRefresh();
}

function refreshMapLayout(delay = 0) {
  if (
    typeof map === "undefined" ||
    !map ||
    typeof map.invalidateSize !== "function"
  ) {
    return;
  }

  window.clearTimeout(mapLayoutRefreshTimer);

  const run = () => {
    map.invalidateSize({
      animate: false,
      pan: false
    });
  };

  mapLayoutRefreshTimer = window.setTimeout(() => {
    window.requestAnimationFrame(run);
    window.setTimeout(run, 220);
  }, delay);
}

function setupMapLayoutRefresh() {
  if (mapLayoutRefreshInitialized) {
    refreshMapLayout(80);
    return;
  }

  mapLayoutRefreshInitialized = true;

  const mapElement =
    document.getElementById("map");

  if (
    mapElement &&
    typeof ResizeObserver !== "undefined"
  ) {
    mapLayoutObserver =
      new ResizeObserver(() => {
        refreshMapLayout(40);
      });

    mapLayoutObserver.observe(mapElement);
  }

  window.addEventListener(
    "resize",
    () => refreshMapLayout(80)
  );

  window.addEventListener(
    "orientationchange",
    () => refreshMapLayout(120)
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        refreshMapLayout(80);
      }
    }
  );

  refreshMapLayout(120);
}

window.refreshMapLayout =
  refreshMapLayout;

function setMapStyle(styleName) {
  const style =
    MAP_STYLES[styleName] ||
    MAP_STYLES.standard;

  if (baseLayer) {
    map.removeLayer(baseLayer);
  }

  baseLayer =
    L.tileLayer(
      style.url,
      {
        ...style.options,
        updateWhenZooming: false,
        updateWhenIdle: true,
        updateInterval: 160,
        keepBuffer: 3
      }
    ).addTo(map);

  localStorage.setItem(
    "sportEventMap.mapStyle",
    MAP_STYLES[styleName]
      ? styleName
      : "standard"
  );
}

function parseMapCoordinate(value) {
  return parseFloat(
    String(value || "")
      .replace(",", ".")
  );
}

function getMarkerCoordinate(event, field, displayField) {
  const displayValue =
    event && event[displayField];

  if (
    displayValue !== undefined &&
    displayValue !== null &&
    displayValue !== ""
  ) {
    return parseMapCoordinate(displayValue);
  }

  return parseMapCoordinate(
    event && event[field]
  );
}

function applyDisplayCoordinateOffsets(events) {
  const groups = new Map();

  events.forEach((event) => {
    delete event._displayLatitude;
    delete event._displayLongitude;
    delete event._displayOffsetCount;
    delete event._displayOffsetIndex;

    const lat =
      parseMapCoordinate(event.latitude);

    const lng =
      parseMapCoordinate(event.longitude);

    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng)
    ) {
      return;
    }

    const key =
      `${lat.toFixed(5)},${lng.toFixed(5)}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(event);
  });

  groups.forEach((group) => {
    if (group.length < 2) {
      return;
    }

    group.forEach((event, index) => {
      const lat =
        parseMapCoordinate(event.latitude);

      const lng =
        parseMapCoordinate(event.longitude);

      const angle =
        (Math.PI * 2 * index) / group.length;

      const radiusMeters =
        Math.min(70, 20 + group.length * 4);

      const latOffset =
        Math.sin(angle) * radiusMeters / 111320;

      const lngOffset =
        Math.cos(angle) *
        radiusMeters /
        (111320 * Math.cos(lat * Math.PI / 180));

      event._displayLatitude =
        lat + latOffset;

      event._displayLongitude =
        lng + lngOffset;

      event._displayOffsetCount =
        group.length;

      event._displayOffsetIndex =
        index + 1;
    });
  });

  return events;
}

// ADD MARKER
function addMarker(event) {
  const lat =
    getMarkerCoordinate(
      event,
      "latitude",
      "_displayLatitude"
    );

  const lng =
    getMarkerCoordinate(
      event,
      "longitude",
      "_displayLongitude"
    );

  // ✅ SAFE VALIDATION
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    console.warn("Invalid coordinates skipped:", event);
    return;
  }

  const marker = L.marker([lat, lng], { icon: redIcon });

  marker.bindPopup(createPopup(event));

  marker.on("click", () => {
    highlightCard(getEventKey(event));

    if (typeof window.openDrawer === "function") {
      window.openDrawer(event);
    } else if (typeof openDrawer === "function") {
      openDrawer(event);
    }
  });

  if (!deferMarkerLayerUpdates) {
    markerLayer.addLayer(marker);
  }

  allMarkers.push({
    marker,
    data: event
  });
}

function setVisibleMapMarkers(markerItems) {
  if (!markerLayer) {
    return;
  }

  const markers =
    (markerItems || [])
      .map(item => item && item.marker)
      .filter(Boolean);

  markerLayer.clearLayers();

  if (
    markers.length &&
    typeof markerLayer.addLayers === "function"
  ) {
    markerLayer.addLayers(markers);
    return;
  }

  markers.forEach(marker => {
    markerLayer.addLayer(marker);
  });
}

// FIT MAP
function fitToMarkers() {
  if (allMarkers.length === 0) return;

  const group = L.featureGroup(
    allMarkers.map((m) => m.marker)
  );

  map.fitBounds(group.getBounds(), {
    padding: [50, 50]
  });
}

// CLEAR
function clearMarkers() {
  markerLayer.clearLayers();
  allMarkers = []; // Keeps refreshes clean.
}

// FOCUS EVENT
function focusEvent(event) {
  const lat =
    getMarkerCoordinate(
      event,
      "latitude",
      "_displayLatitude"
    );

  const lng =
    getMarkerCoordinate(
      event,
      "longitude",
      "_displayLongitude"
    );

  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) return;

  map.flyTo([lat, lng], Math.max(map.getZoom(), 14), {
    duration: 1.5
  });
}

// INIT
initMap();

function resetMapFilters() {

  const searchInput =
    document.getElementById("searchInput");

  if (searchInput) {

    searchInput.value = "";

  }

  const dateFromFilter =
    document.getElementById("dateFromFilter");

  if (dateFromFilter) {

    dateFromFilter.value = "";

  }

  const dateToFilter =
    document.getElementById("dateToFilter");

  if (dateToFilter) {

    dateToFilter.value = "";

  }

  const dateFilter =
    document.getElementById("dateFilter");

  if (dateFilter) {

    dateFilter.value = "all";

  }

  const sortSelect =
    document.getElementById("sortSelect");

  if (sortSelect) {

    sortSelect.value = "date";

  }

  document
    .querySelectorAll(".filter-chip")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.filter === "All"
      );

    });

  if (typeof currentFilter !== "undefined") {

    currentFilter = "All";

  }

  if (typeof selectedSportFilters !== "undefined") {

    selectedSportFilters = [];

  }

  if (typeof selectedDistanceFilters !== "undefined") {

    selectedDistanceFilters = [];

  }

  if (typeof syncSportFilterButtons === "function") {

    syncSportFilterButtons();

  }

  if (typeof syncDistanceFilterButtons === "function") {

    syncDistanceFilterButtons();

  }

  if (typeof updateDateRangeState === "function") {

    updateDateRangeState();

  }

}


function refreshEvents(options = {}) {

  console.log("Refreshing events");

  const refreshToken =
    ++eventsRefreshToken;

  const list =
    document.getElementById("eventList");

  if (list) {
    list.innerHTML = `
      <div class="event-list-empty event-list-loading">
        <strong>Loading events</strong>
        <span>Preparing the map and event list.</span>
      </div>
    `;
  }

  clearMarkers();

  loadEvents((events) => {
  if (refreshToken !== eventsRefreshToken) {
    return;
  }

  console.log("Loaded events:", events);

  const mapEvents =
    applyDisplayCoordinateOffsets(events);

  deferMarkerLayerUpdates = true;

  mapEvents.forEach((event) => {
    addMarker(event);
  });

  deferMarkerLayerUpdates = false;

  setVisibleMapMarkers(allMarkers);

  if (!options.preserveView) {
    resetDiscoveryMapView();
  }

  refreshMapLayout(40);

  try {
    if (
      typeof initSearch === "function" &&
      !searchInitialized
    ) {

      initSearch();

      searchInitialized = true;

    }

    if (
      typeof applyFilters === "function" &&
      searchInitialized
    ) {

      if (options.resetFilters) {

        resetMapFilters();

      }

      applyFilters();

    }
    else {
      renderEventList(events);
    }
  } catch (error) {
    console.error(
      "Search/filter refresh failed. Keeping map markers visible.",
      error
    );

    if (typeof renderEventList === "function") {
      renderEventList(events);
    }
  }

  });

}

window.refreshEvents = refreshEvents;

window.setMapStyle = setMapStyle;

window.resetDiscoveryMapView =
  resetDiscoveryMapView;

window.setVisibleMapMarkers =
  setVisibleMapMarkers;

refreshEvents();
