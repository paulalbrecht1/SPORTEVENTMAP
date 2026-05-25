let map;

let allMarkers = [];

// MARKER CLUSTER
let markerLayer =
  L.markerClusterGroup();


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

  map =
    L.map("map")
    .setView([20, 0], 2);


  // LIGHT MAP
  L.tileLayer(

    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",

    {
      attribution:
        "&copy; OpenStreetMap & CartoDB"
    }

  ).addTo(map);


  // MARKER CLUSTER
  map.addLayer(markerLayer);

}


// ADD MARKER
function addMarker(event) {

  if (
    !event.latitude ||
    !event.longitude
  ) return;


  const marker =
    L.marker(

      [
        parseFloat(event.latitude),
        parseFloat(event.longitude)
      ],

      {
        icon: redIcon
      }

    );


  // POPUP
  marker.bindPopup(
    createPopup(event)
  );


  // CLICK
  marker.on("click", () => {

    highlightCard(
      event.event_name
    );

    openDrawer(event);

  });


  // ADD TO CLUSTER
  markerLayer.addLayer(marker);


  // SAVE
  allMarkers.push({

    marker,

    data: event

  });

}


// FIT MAP TO MARKERS
function fitToMarkers() {

  if (allMarkers.length === 0)
    return;


  const group =
    L.featureGroup(

      allMarkers.map(
        m => m.marker
      )

    );


  map.fitBounds(

    group.getBounds(),

    {
      padding: [50, 50]
    }

  );

}


// CLEAR MARKERS
function clearMarkers() {

  markerLayer.clearLayers();

}


// FOCUS EVENT
function focusEvent(event) {

  map.flyTo(

    [
      parseFloat(event.latitude),
      parseFloat(event.longitude)
    ],

    10,

    {
      duration: 1.5
    }

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