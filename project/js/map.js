let map;
let markerLayer = L.markerClusterGroup();

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

function initMap() {

  map = L.map("map").setView([20, 0], 2);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "&copy; OpenStreetMap & CartoDB"
    }
  ).addTo(map);

  map.addLayer(markerLayer);
}

function addMarker(event) {
  if (!event.latitude || !event.longitude) return;

  const marker = L.marker(
    [
      parseFloat(event.latitude),
      parseFloat(event.longitude)
    ],
    { icon: redIcon }
  );

  marker.bindPopup(createPopup(event));

  marker.on("click", () => {
    highlightCard(event.event_name);
    openDrawer(event);
  });

  markerLayer.addLayer(marker);

  // FIX: state usage
  state.markers.set(event.event_name, {
    marker,
    data: event
  });
  marker._eventId = event.event_name;
}

function fitToMarkers() {

  const markers = Array.from(state.markers.values());

  if (markers.length === 0) return;

  const group = L.featureGroup(
    markers.map(m => m.marker)
  );

  map.fitBounds(group.getBounds(), {
    padding: [50, 50]
  });
}

function clearMarkers() {
  markerLayer.clearLayers();
}

function focusEvent(event) {

  map.flyTo(
    [
      parseFloat(event.latitude),
      parseFloat(event.longitude)
    ],
    10,
    { duration: 1.5 }
  );
}

initMap();

loadEvents(events => {

  events.forEach(event => {
    addMarker(event);
  });

  fitToMarkers();

  renderEventList(events);

  initSearch();
});