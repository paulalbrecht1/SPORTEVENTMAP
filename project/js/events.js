let events = [];

let favorites =
  JSON.parse(
    localStorage.getItem("favorites")
  ) || [];


// LOAD CSV
function loadEvents(callback) {

  Papa.parse("data/events.csv", {

    download: true,

    header: true,

    delimiter: ";",

    complete: function(results) {

      console.log(results.data);

      events = results.data;

      callback(events);

    }

  });

}


// POPUP
function createPopup(event) {

  return `

    <div class="popup-card">

      <div class="popup-title">
        ${event.event_name}
      </div>

      <div class="popup-meta">
        📍 ${event.city}, ${event.country}
      </div>

      <div class="popup-meta">
        📅 ${event.date}
      </div>

      <div class="popup-distance">
        ${event.distance}
      </div>

    </div>

  `;

}


// EVENT LIST
function renderEventList(events) {

  const container =
    document.getElementById(
      "eventList"
    );

  container.innerHTML = "";

  events.forEach(event => {

    const div =
      document.createElement("div");

    div.className = "event-card";

    div.dataset.name =
      event.event_name;


    div.innerHTML = `

      <div class="event-top">

        <div class="event-title">
          ${event.event_name}
        </div>

        <div
          class="favorite-btn"
          onclick="
            event.stopPropagation();
            toggleFavorite(
              '${event.event_name}'
            )
          "
        >
          ${
            favorites.includes(
              event.event_name
            )
            ? "❤️"
            : "🤍"
          }
        </div>

      </div>


      <div class="event-meta">
        📍 ${event.city}, ${event.country}
      </div>

      <div class="event-meta">
        📅 ${event.date}
      </div>

      <div class="event-distance">
        ${event.distance}
      </div>

      <div class="event-sport">
        ${event.sport}
      </div>

    `;


    // HOVER
    div.addEventListener(
      "mouseenter",
      () => {

        const found =
          allMarkers.find(

            item =>

              item.data.event_name
              ===
              event.event_name

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

        focusEvent(event);

        openDrawer(event);

      }
    );


    container.appendChild(div);

  });

}


// HIGHLIGHT CARD
function highlightCard(eventName) {

  document
    .querySelectorAll(".event-card")
    .forEach(card => {

      if (
        card.dataset.name
        ===
        eventName
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

  let imageUrl = "";


  if (event.sport === "Running") {

    imageUrl =
      "https://images.unsplash.com/photo-1547347298-4074fc3086f0?q=80&w=1600&auto=format&fit=crop";

  }

  else if (
    event.sport === "Triathlon"
  ) {

    imageUrl =
      "https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=1600&auto=format&fit=crop";

  }

  else {

    imageUrl =
      "https://images.unsplash.com/photo-1486218119243-13883505764c?q=80&w=1600&auto=format&fit=crop";

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

    <button id="closeDrawer">
      ✕
    </button>


    <div
      class="drawer-hero"
      style="
        background:
          linear-gradient(
            rgba(0,0,0,0.3),
            rgba(0,0,0,0.3)
          ),
          url('${imageUrl}');
      "
    >

      <div class="drawer-overlay">

        <h2>
          ${event.event_name}
        </h2>

      </div>

    </div>


    <div class="drawer-section">

      <div class="drawer-label">
        Location
      </div>

      <div class="drawer-text">
        📍 ${event.city}, ${event.country}
      </div>

    </div>


    <div class="drawer-section">

      <div class="drawer-label">
        Date
      </div>

      <div class="drawer-text">
        📅 ${event.date}
      </div>

    </div>


    <div class="drawer-section">

      <div class="drawer-label">
        Distance
      </div>

      <div class="drawer-text">
        🏃 ${event.distance}
      </div>

    </div>


    <a
      class="drawer-button"
      href="${event.event_url}"
      target="_blank"
    >
      View Event
    </a>

  `;


  drawer.classList.add("open");


  setTimeout(() => {

    map.invalidateSize();

  }, 350);


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

        setTimeout(() => {

          map.invalidateSize();

        }, 350);

      }
    );

}


// FAVORITES
function toggleFavorite(name) {

  if (favorites.includes(name)) {

    favorites =
      favorites.filter(
        f => f !== name
      );

  }

  else {

    favorites.push(name);

  }


  localStorage.setItem(

    "favorites",

    JSON.stringify(favorites)

  );


  renderEventList(

    allMarkers.map(
      item => item.data
    )

  );

}