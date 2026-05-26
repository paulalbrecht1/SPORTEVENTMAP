let currentFilter = "All";

function initSearch() {

  // SEARCH INPUT
  const searchInput =
    document.getElementById(
      "searchInput"
    );

  // LIVE FILTER
  searchInput.addEventListener(
    "input",
    applyFilters
  );

  // ENTER SEARCH
  searchInput.addEventListener(
    "keydown",
    function(e) {

      if (e.key === "Enter") {

        applyFilters(true);

      }

    }
  );

  // FILTER BUTTONS
  document
    .querySelectorAll(".filter-chip")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          // ACTIVE RESET
          document
            .querySelectorAll(
              ".filter-chip"
            )
            .forEach(btn => {

              btn.classList.remove(
                "active"
              );

            });

          // ACTIVE BUTTON
          button.classList.add(
            "active"
          );

          // FILTER SET
          currentFilter =
            button.dataset.filter;

          applyFilters();

        }
      );

    });

  // SORT
  document
    .getElementById("sortSelect")
    .addEventListener(
      "change",
      applyFilters
    );

  // DATE FILTER
  document
    .getElementById("dateFilter")
    .addEventListener(
      "change",
      applyFilters
    );

}

function applyFilters(zoom = false) {

  const searchValue =
    document.getElementById("searchInput")
      .value.toLowerCase();

  const sort =
    document.getElementById("sortSelect").value;

  const dateFilter =
    document.getElementById("dateFilter").value;

  // 👉 WICHTIG: stabile Datenbasis
  let filtered = Array.from(state.markers.values());

  // SEARCH + SPORT FILTER
  filtered = filtered.filter(item => {

    const event = item.data;

    const searchable =
      `${event.event_name} ${event.city} ${event.country} ${event.sport}`
        .toLowerCase();

    const matchesSearch =
      searchable.includes(searchValue);

    const matchesSport =
      currentFilter === "All" ||
      event.sport === currentFilter;

    return matchesSearch && matchesSport;
  });

  // DATE FILTER
  if (dateFilter === "upcoming") {

    const now = new Date();

    filtered = filtered.filter(item => {
      return new Date(item.data.date) >= now;
    });

  }

  // SORT
  if (sort === "name") {
    filtered.sort((a, b) =>
      a.data.event_name.localeCompare(b.data.event_name)
    );
  }

  // MAP UPDATE
  markerLayer.clearLayers();

  filtered.forEach(item => {
    markerLayer.addLayer(item.marker);
  });

  // LIST UPDATE
  renderEventList(filtered.map(i => i.data));

  // ZOOM LOGIC
  if (zoom && filtered.length > 0) {

    if (filtered.length === 1) {

      map.flyTo(
        filtered[0].marker.getLatLng(),
        12,
        { duration: 1 }
      );

      return;
    }

    const bounds =
      L.latLngBounds(
        filtered.map(item => item.marker.getLatLng())
      );

    map.flyToBounds(bounds, {
      padding: [80, 80],
      duration: 1
    });
  }
}

