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

document.getElementById("favoritesBtn")
.addEventListener("click", () => {

  state.showingFavorites = !state.showingFavorites;

  const btn = document.getElementById("favoritesBtn");

  btn.classList.toggle("active", state.showingFavorites);

  let filtered = Array.from(state.markers.values());

  if (state.showingFavorites) {
    filtered = filtered.filter(item =>
      state.favorites.has(item.data.event_name)
    );
  }

  markerLayer.clearLayers();

  filtered.forEach(item => {
    markerLayer.addLayer(item.marker);
  });

  renderEventList(filtered.map(i => i.data));
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