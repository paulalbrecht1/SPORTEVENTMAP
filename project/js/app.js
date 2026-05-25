const sidebar =
  document.getElementById("sidebar");

const toggleBtn =
  document.getElementById("toggleSidebar");


// SIDEBAR TOGGLE
toggleBtn.addEventListener("click", () => {

  sidebar.classList.toggle("closed");

  setTimeout(() => {

    map.invalidateSize();

  }, 350);

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

      const filtered =
        allMarkers.filter(item =>
          favorites.includes(
            item.data.event_name
          )
        );

      markerLayer.clearLayers();

      filtered.forEach(item => {

        markerLayer.addLayer(
          item.marker
        );

      });

      renderEventList(
        filtered.map(
          item => item.data
        )
      );

    }

    else {

      btn.classList.remove("active");

      applyFilters();

    }

  });


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

      }
    );

  });