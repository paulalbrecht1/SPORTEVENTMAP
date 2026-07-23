(function initializeDiscoveryEventDetail() {
  "use strict";

  const originalOpenDrawer =
    window.openDrawer;

  if (typeof originalOpenDrawer !== "function") {
    return;
  }

  const translations = {
    en: {
      close: "Close event details",
      add: "+ Add to Season",
      adding: "Adding…",
      added: "✓ Added to Season",
      remove: "Remove from Season",
      removing: "Removing…",
      addedMessage: "Added to your Season Planner.",
      removedMessage: "Removed from your Season Planner.",
      addError: "This event could not be added. Please try again.",
      removeError: "This event could not be removed. Please try again.",
      loginRequired: "Log in to add this event to your Season Planner.",
      savedHint: "Select again to remove this event from your season.",
      official: "Official website",
      verify: "Verify final race details on the official organizer website before booking or registering.",
      date: "Date",
      location: "Location",
      sport: "Sport",
      distance: "Distance",
      keyFacts: "Key Facts",
      registration: "Registration",
      course: "Course",
      logistics: "Logistics",
      sources: "Sources",
      eventOverview: "Event overview",
      registrationStatus: "Registration status",
      courseCopy: "Use the listed distance as a planning reference and confirm the final course information with the organizer.",
      logisticsCopy: "Plan travel, accommodation and race-day arrival around the official start location.",
      sourceCopy: "Organizer information is the primary source for registration, course and race-day updates.",
      lastChecked: "Last checked",
      fullGuide: "Open full race guide",
      copy: "Copy event link",
      share: "Share",
      copied: "Event link copied.",
      copyError: "The event link could not be copied.",
      fallbackStatus: "Registration status unclear"
    },
    de: {
      close: "Eventdetails schließen",
      add: "+ Zur Saison hinzufügen",
      adding: "Wird hinzugefügt…",
      added: "✓ Zur Saison hinzugefügt",
      remove: "Aus Saison entfernen",
      removing: "Wird entfernt…",
      addedMessage: "Event wurde deinem Saisonplaner hinzugefügt.",
      removedMessage: "Event wurde aus deinem Saisonplaner entfernt.",
      addError: "Das Event konnte nicht hinzugefügt werden. Bitte versuche es erneut.",
      removeError: "Das Event konnte nicht entfernt werden. Bitte versuche es erneut.",
      loginRequired: "Melde dich an, um das Event in deinem Saisonplaner zu speichern.",
      savedHint: "Erneut auswählen, um das Event aus deiner Saison zu entfernen.",
      official: "Offizielle Website",
      verify: "Prüfe finale Renndetails vor Buchung oder Anmeldung auf der offiziellen Veranstalterseite.",
      date: "Datum",
      location: "Ort",
      sport: "Sport",
      distance: "Distanz",
      keyFacts: "Eckdaten",
      registration: "Anmeldung",
      course: "Strecke",
      logistics: "Logistik",
      sources: "Quellen",
      eventOverview: "Eventübersicht",
      registrationStatus: "Anmeldestatus",
      courseCopy: "Nutze die angegebene Distanz zur Planung und bestätige finale Streckeninformationen beim Veranstalter.",
      logisticsCopy: "Plane Anreise, Unterkunft und Ankunft am Renntag anhand des offiziellen Startorts.",
      sourceCopy: "Die Veranstalterseite ist die wichtigste Quelle für Anmeldung, Strecke und aktuelle Renntagsinformationen.",
      lastChecked: "Zuletzt geprüft",
      fullGuide: "Vollständigen Race Guide öffnen",
      copy: "Eventlink kopieren",
      share: "Teilen",
      copied: "Eventlink wurde kopiert.",
      copyError: "Der Eventlink konnte nicht kopiert werden.",
      fallbackStatus: "Anmeldestatus unklar"
    }
  };

  let currentEvent = null;
  let pendingOperation = "";
  let sectionObserver = null;

  function getLanguage() {
    if (typeof window.getAppLanguage === "function") {
      return window.getAppLanguage() === "de"
        ? "de"
        : "en";
    }

    return document.documentElement.lang === "de"
      ? "de"
      : "en";
  }

  function text(key) {
    const language =
      getLanguage();

    return translations[language][key] ||
      translations.en[key] ||
      key;
  }

  function escapeValue(value) {
    if (typeof window.escapeHTML === "function") {
      return window.escapeHTML(value);
    }

    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getSafeUrl(value) {
    if (typeof window.safeUrl === "function") {
      return window.safeUrl(value);
    }

    try {
      const url = new URL(String(value || ""));

      return url.protocol === "http:" || url.protocol === "https:"
        ? url.href
        : "#";
    } catch (_error) {
      return "#";
    }
  }

  function isSaved(event) {
    return typeof window.isFavorite === "function" &&
      window.isFavorite(event);
  }

  function getEventLabel(event) {
    if (typeof window.getEventFormatLabel === "function") {
      return window.getEventFormatLabel(event);
    }

    return event.sport || "Event";
  }

  function getNaturalIntroduction(event) {
    const location =
      [event.city, event.country]
        .filter(Boolean)
        .join(", ");

    if (getLanguage() === "de") {
      return `Entdecke ${event.event_name}${location ? ` in ${location}` : ""} mit Distanzen, Anmeldung, Streckeninformationen und allem, was du für die Planung deiner Saison brauchst.`;
    }

    return `Explore ${event.event_name}${location ? ` in ${location}` : ""}, including race distances, registration details, course information and everything needed to plan it as part of your season.`;
  }

  function externalIcon() {
    return `<svg class="discovery-detail-external-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 5h5v5M19 5l-8 8"/><path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/></svg>`;
  }

  function statusMarkup(event) {
    const config =
      typeof window.getEventStatusConfig === "function"
        ? window.getEventStatusConfig(event)
        : null;
    const label =
      config?.label ||
      String(event.verification_status || text("fallbackStatus"))
        .replace(/_/g, " ")
        .replace(/\b\w/g, character => character.toUpperCase());
    const tone =
      String(config?.className || "status-unclear")
        .replace(/[^a-z0-9_-]/gi, "");

    return `<span class="discovery-detail-status-badge ${tone}"><span aria-hidden="true"></span>${escapeValue(label)}</span>`;
  }

  function metadataPill(icon, label, value) {
    return `
      <div class="discovery-detail-meta-pill">
        <span class="discovery-detail-meta-icon" aria-hidden="true">${icon}</span>
        <span class="discovery-detail-meta-copy">
          <small>${escapeValue(label)}</small>
          <strong>${escapeValue(value || "—")}</strong>
        </span>
      </div>`;
  }

  function setActionStatus(message, tone = "") {
    const status =
      document.getElementById("discoveryDetailActionStatus");

    if (!status) {
      return;
    }

    status.textContent = message || "";
    status.dataset.tone = tone;
  }

  function updateSeasonButton(event) {
    const button =
      document.getElementById("discoveryDetailSeasonButton");
    const savedHint =
      document.getElementById("discoveryDetailSavedHint");

    if (!button) {
      return;
    }

    const saved =
      isSaved(event);
    const isPending =
      Boolean(pendingOperation);

    button.disabled = isPending;
    button.classList.toggle("active", saved && !isPending);
    button.classList.toggle("is-pending", isPending);
    button.setAttribute("aria-pressed", saved ? "true" : "false");
    button.setAttribute("aria-busy", isPending ? "true" : "false");
    button.setAttribute(
      "aria-label",
      saved
        ? `${text("added")}. ${text("remove")}`
        : text("add")
    );
    button.title = saved
      ? text("remove")
      : text("add");

    if (pendingOperation === "add") {
      button.textContent = text("adding");
    } else if (pendingOperation === "remove") {
      button.textContent = text("removing");
    } else {
      button.textContent = saved
        ? text("added")
        : text("add");
    }

    if (savedHint) {
      savedHint.hidden = !saved || isPending;
      savedHint.textContent = text("savedHint");
    }
  }

  async function ensureSignedIn() {
    if (typeof window.canOpenSeasonPlanner !== "function") {
      return true;
    }

    try {
      return await window.canOpenSeasonPlanner();
    } catch (_error) {
      return false;
    }
  }

  async function toggleSeason(event) {
    if (pendingOperation) {
      return;
    }

    const wasSaved =
      isSaved(event);

    pendingOperation = wasSaved
      ? "remove"
      : "add";
    setActionStatus("", "");
    updateSeasonButton(event);

    try {
      if (wasSaved) {
        const signedIn =
          await ensureSignedIn();

        if (!signedIn) {
          if (typeof window.showAppMessage === "function") {
            window.showAppMessage("Login required", text("loginRequired"));
          }

          if (typeof window.openAuthModal === "function") {
            window.openAuthModal("login");
          }

          setActionStatus(text("loginRequired"), "info");
          return;
        }

        if (typeof window.toggleFavorite !== "function") {
          throw new Error("Season removal is unavailable.");
        }

        window.toggleFavorite(event);

        if (isSaved(event)) {
          throw new Error("Season removal did not complete.");
        }

        setActionStatus(text("removedMessage"), "success");
      } else {
        if (typeof window.addEventToSeasonPlanner !== "function") {
          throw new Error("Season addition is unavailable.");
        }

        const added =
          await window.addEventToSeasonPlanner(event, {
            source: "discovery_detail"
          });

        if (!added) {
          setActionStatus(text("loginRequired"), "info");
          return;
        }

        if (!isSaved(event)) {
          throw new Error("Season addition did not complete.");
        }

        setActionStatus(text("addedMessage"), "success");
      }
    } catch (error) {
      console.warn("Could not update Season Planner from event details.", error);

      if (isSaved(event) !== wasSaved && typeof window.toggleFavorite === "function") {
        window.toggleFavorite(event);
      }

      setActionStatus(
        wasSaved
          ? text("removeError")
          : text("addError"),
        "error"
      );
    } finally {
      pendingOperation = "";
      updateSeasonButton(event);
    }
  }

  function closeDrawer() {
    const drawer =
      document.getElementById("eventDrawer");

    drawer?.classList.remove("open");
    document.body.classList.remove("fullscreen-drawer-open");

    if (typeof window.refreshMapLayout === "function") {
      window.refreshMapLayout(350);
    }

    if (typeof window.closePlatformEventRoute === "function") {
      window.closePlatformEventRoute();
    }
  }

  function setActiveNavigation(sectionId) {
    document
      .querySelectorAll("#discoveryDetailNavigation [data-discovery-detail-section]")
      .forEach(link => {
        const active =
          link.dataset.discoveryDetailSection === sectionId;

        link.classList.toggle("active", active);

        if (active) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
  }

  function initializeNavigation(content) {
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }

    const links =
      Array.from(
        content.querySelectorAll("[data-discovery-detail-section]")
      );

    links.forEach(link => {
      link.addEventListener("click", clickEvent => {
        clickEvent.preventDefault();

        const target =
          document.getElementById(
            link.dataset.discoveryDetailSection
          );

        if (!target) {
          return;
        }

        target.scrollIntoView({
          behavior:
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          block: "start"
        });

        setActiveNavigation(target.id);
      });
    });

    const sections =
      Array.from(
        content.querySelectorAll(".discovery-detail-section[id]")
      );

    if (!("IntersectionObserver" in window) || !sections.length) {
      return;
    }

    sectionObserver = new IntersectionObserver(
      entries => {
        const visible =
          entries
            .filter(entry => entry.isIntersecting)
            .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visible) {
          setActiveNavigation(visible.target.id);
        }
      },
      {
        root: content,
        rootMargin: "-78px 0px -55% 0px",
        threshold: [0.12, 0.35, 0.6]
      }
    );

    sections.forEach(section =>
      sectionObserver.observe(section)
    );
  }

  function bindInteractions(event, content) {
    content
      .querySelector("#closeDrawer")
      ?.addEventListener("click", closeDrawer);

    content
      .querySelector(".drawer-favorite-btn")
      ?.addEventListener("click", clickEvent => {
        clickEvent.stopPropagation();

        if (typeof window.toggleFavorite === "function") {
          window.toggleFavorite(event);
          updateSeasonButton(event);
        }
      });

    content
      .querySelector("#discoveryDetailSeasonButton")
      ?.addEventListener("click", clickEvent => {
        clickEvent.stopPropagation();
        toggleSeason(event);
      });

    content
      .querySelector("#discoveryDetailOfficialWebsite")
      ?.addEventListener("click", () => {
        if (typeof window.trackEvent !== "function") {
          return;
        }

        let urlHost = "invalid_url";

        try {
          urlHost = new URL(event.event_url).hostname;
        } catch (_error) {
          // Invalid organizer URLs remain non-navigating.
        }

        window.trackEvent("external_event_website_clicked", {
          event_id:
            typeof window.getEventKey === "function"
              ? window.getEventKey(event)
              : "",
          sport: event.sport || "",
          source: "discovery_detail",
          url_host: urlHost
        });
      });

    content
      .querySelector("#discoveryDetailCopyButton")
      ?.addEventListener("click", async () => {
        try {
          if (typeof window.copyEventLink === "function") {
            await window.copyEventLink(event);
          } else {
            await navigator.clipboard.writeText(window.location.href);
          }

          setActionStatus(text("copied"), "success");
        } catch (_error) {
          setActionStatus(text("copyError"), "error");
        }
      });

    content
      .querySelector("#discoveryDetailShareButton")
      ?.addEventListener("click", () => {
        if (typeof window.shareEvent === "function") {
          window.shareEvent(event);
        }
      });

    initializeNavigation(content);
  }

  function renderDrawer(event) {
    const content =
      document.getElementById("drawerContent");

    if (!content) {
      return;
    }

    const eventKey =
      typeof window.getEventKey === "function"
        ? window.getEventKey(event)
        : event.event_key || "";
    const detailUrl =
      typeof window.getEventDetailUrl === "function"
        ? window.getEventDetailUrl(event)
        : "";
    const website =
      getSafeUrl(event.event_url);
    const location =
      [event.city, event.country]
        .filter(Boolean)
        .join(", ");
    const sportLabel =
      getEventLabel(event);
    const eventIcon =
      typeof window.getSportIconMarkup === "function"
        ? window.getSportIconMarkup(event)
        : "";

    content.innerHTML = `
      <button id="closeDrawer" class="discovery-detail-close" type="button" aria-label="${escapeValue(text("close"))}" data-testid="drawer-close">&times;</button>

      <header class="discovery-detail-header">
        <div class="drawer-title-icon" aria-hidden="true">${eventIcon}</div>
        <div class="discovery-detail-heading">
          <span class="drawer-title-kicker">${escapeValue(sportLabel)}</span>
          <h2 data-testid="drawer-event-name">${escapeValue(event.event_name)}</h2>
          <p>${escapeValue(event.date)} · ${escapeValue(location)}</p>
        </div>
        <button class="drawer-favorite-btn ${isSaved(event) ? "active" : ""}" type="button" aria-label="Toggle favorite" data-event-key="${escapeValue(eventKey)}" data-testid="drawer-favorite">${isSaved(event) ? "&#10084;" : "&#9825;"}</button>
      </header>

      <p class="discovery-detail-introduction">${escapeValue(getNaturalIntroduction(event))}</p>

      <div class="discovery-detail-meta-grid" aria-label="${escapeValue(text("eventOverview"))}">
        ${metadataPill("◷", text("date"), event.date)}
        ${metadataPill("⌖", text("location"), location)}
        ${metadataPill("●", text("sport"), sportLabel)}
        ${metadataPill("↔", text("distance"), event.distance)}
      </div>

      <aside class="discovery-detail-action-card">
        <div class="discovery-detail-status-block">
          ${statusMarkup(event)}
          <p>${escapeValue(text("verify"))}</p>
        </div>
        <div class="discovery-detail-action-group">
          <button id="discoveryDetailSeasonButton" class="drawer-season-btn" type="button" data-event-key="${escapeValue(eventKey)}" data-testid="drawer-add-to-planner"></button>
          ${website !== "#"
            ? `<a id="discoveryDetailOfficialWebsite" class="discovery-detail-official-button" href="${escapeValue(website)}" target="_blank" rel="noopener noreferrer"><span>${escapeValue(text("official"))}</span>${externalIcon()}</a>`
            : ""}
        </div>
        <p id="discoveryDetailSavedHint" class="discovery-detail-saved-hint" hidden></p>
        <p id="discoveryDetailActionStatus" class="discovery-detail-action-status" role="status" aria-live="polite"></p>
      </aside>

      <div class="discovery-detail-utility-actions">
        <button id="discoveryDetailCopyButton" type="button">${escapeValue(text("copy"))}</button>
        <button id="discoveryDetailShareButton" type="button">${escapeValue(text("share"))}</button>
      </div>

      <nav id="discoveryDetailNavigation" class="discovery-detail-navigation" aria-label="Event detail sections">
        <a class="active" href="#discovery-detail-key-facts" data-discovery-detail-section="discovery-detail-key-facts" aria-current="location"><span aria-hidden="true">◆</span>${escapeValue(text("keyFacts"))}</a>
        <a href="#discovery-detail-registration" data-discovery-detail-section="discovery-detail-registration"><span aria-hidden="true">✓</span>${escapeValue(text("registration"))}</a>
        <a href="#discovery-detail-course" data-discovery-detail-section="discovery-detail-course"><span aria-hidden="true">⌁</span>${escapeValue(text("course"))}</a>
        <a href="#discovery-detail-logistics" data-discovery-detail-section="discovery-detail-logistics"><span aria-hidden="true">⌖</span>${escapeValue(text("logistics"))}</a>
        <a href="#discovery-detail-sources" data-discovery-detail-section="discovery-detail-sources"><span aria-hidden="true">↗</span>${escapeValue(text("sources"))}</a>
      </nav>

      <div class="discovery-detail-sections">
        <section id="discovery-detail-key-facts" class="discovery-detail-section">
          <h3>${escapeValue(text("keyFacts"))}</h3>
          <div class="drawer-overview-grid">
            <div><span>${escapeValue(text("date"))}</span><strong>${escapeValue(event.date || "—")}</strong></div>
            <div><span>${escapeValue(text("distance"))}</span><strong>${escapeValue(event.distance || "—")}</strong></div>
            <div><span>${escapeValue(text("location"))}</span><strong>${escapeValue(location || "—")}</strong></div>
            <div><span>${escapeValue(text("sport"))}</span><strong>${escapeValue(sportLabel || "—")}</strong></div>
          </div>
        </section>

        <section id="discovery-detail-registration" class="discovery-detail-section">
          <h3>${escapeValue(text("registration"))}</h3>
          <div class="discovery-detail-section-row"><span>${escapeValue(text("registrationStatus"))}</span>${statusMarkup(event)}</div>
          <p>${escapeValue(text("verify"))}</p>
        </section>

        <section id="discovery-detail-course" class="discovery-detail-section">
          <h3>${escapeValue(text("course"))}</h3>
          <strong class="discovery-detail-section-value">${escapeValue(event.distance || "—")}</strong>
          <p>${escapeValue(text("courseCopy"))}</p>
        </section>

        <section id="discovery-detail-logistics" class="discovery-detail-section">
          <h3>${escapeValue(text("logistics"))}</h3>
          <strong class="discovery-detail-section-value">${escapeValue(location || "—")}</strong>
          <p>${escapeValue(text("logisticsCopy"))}</p>
        </section>

        <section id="discovery-detail-sources" class="discovery-detail-section">
          <h3>${escapeValue(text("sources"))}</h3>
          <p>${escapeValue(text("sourceCopy"))}</p>
          ${event.last_checked ? `<p class="discovery-detail-last-checked">${escapeValue(text("lastChecked"))}: <strong>${escapeValue(event.last_checked)}</strong></p>` : ""}
          ${detailUrl ? `<a class="discovery-detail-guide-link" href="${escapeValue(detailUrl)}">${escapeValue(text("fullGuide"))}<span aria-hidden="true">→</span></a>` : ""}
        </section>
      </div>`;

    updateSeasonButton(event);
    bindInteractions(event, content);
  }

  window.openDrawer = function openEnhancedDiscoveryDrawer(event) {
    originalOpenDrawer(event);
    currentEvent = event;
    pendingOperation = "";
    renderDrawer(event);
  };

  document.addEventListener("app-language-changed", () => {
    if (
      currentEvent &&
      document.getElementById("eventDrawer")?.classList.contains("open")
    ) {
      renderDrawer(currentEvent);
    }
  });
})();
