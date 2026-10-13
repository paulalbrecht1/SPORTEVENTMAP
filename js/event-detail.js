(function loadGlobalThemeForEventDetails() {
  if (window.SportEventMapTheme) {
    window.SportEventMapTheme.ensureControls();
    return;
  }

  if (
    typeof document.createElement !== "function" ||
    !document.head ||
    document.querySelector("script[data-global-theme-loader]")
  ) {
    return;
  }

  const currentScript = document.currentScript;
  const themeUrl = currentScript && currentScript.src
    ? new URL("theme.js?v=20260725-publish-runtime-v96", currentScript.src).href
    : "../../js/theme.js?v=20260725-publish-runtime-v96";
  const themeScript = document.createElement("script");

  themeScript.src = themeUrl;
  themeScript.dataset.globalThemeLoader = "true";
  themeScript.addEventListener("load", () => {
    window.SportEventMapTheme?.ensureControls();
  });
  document.head.appendChild(themeScript);
})();

(async function () {
  // Existing /event/<slug>/ documents share this runtime. Refresh their facts
  // before binding the Season Planner to the canonical edition identity.
  if (/^\/event\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:index\.html)?$/.test(window.location.pathname || "") &&
      !document.getElementById("liveDetailContent")) {
    await new Promise(resolve => {
      window.sportEventMapPublicDetailReady = resolve;
      const script = document.createElement("script");
      script.src = "/js/event-detail-live.js?v=20261013-season-auth-v145";
      script.onerror = () => {
        document.documentElement.dataset.semPublicDetailState = "unavailable";
        const notice = document.createElement("p");
        notice.className = "live-detail-notice";
        notice.textContent = document.documentElement.lang === "en"
          ? "Saved data: Current details could not be loaded. Please check with the organizer."
          : "Gespeicherter Datenstand: Aktuelle Angaben konnten nicht geladen werden. Bitte beim Veranstalter prüfen.";
        document.querySelector(".event-detail-header")?.after(notice);
        resolve();
      };
      document.head.append(script);
    });
  }
  const detailConfig =
    window.sportEventMapDetailConfig || {};
  const detailEvent =
    detailConfig.event || {};
  const seasonButton =
    document.getElementById("addDetailEventToSeason");
  const actionStatus =
    document.getElementById("detailActionStatus");

  let isSaved = false;
  let isPending = false;
  let initialStatePromise = Promise.resolve();
  let lastStatusKey = "";
  let lastStatusTone = "";
  const seasonAuthCopy = {
    "detail.loginRequired": { de: "Melde dich an oder erstelle ein Konto, um dieses Event in deiner Saison zu speichern.", en: "Sign in or create an account to save this event in your season." },
    "detail.login": { de: "Anmelden", en: "Sign in" },
    "detail.register": { de: "Konto erstellen", en: "Create account" }
  };

  function translate(key) {
    if (seasonAuthCopy[key]) {
      return seasonAuthCopy[key][document.documentElement?.lang === "en" ? "en" : "de"];
    }
    if (
      window.sportEventMapDetailI18n &&
      typeof window.sportEventMapDetailI18n.translate === "function"
    ) {
      return window.sportEventMapDetailI18n.translate(key);
    }

    return key;
  }

  function getSeasonKey() {
    if (detailEvent.event_key) {
      return String(detailEvent.event_key).toLowerCase();
    }

    return [
      detailEvent.event_name,
      detailEvent.date,
      detailEvent.city
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
  }

  function normalizeFavoriteKey(item) {
    if (typeof item === "string") {
      return item.toLowerCase();
    }

    if (item && typeof item === "object") {
      return String(
        item.event_key ||
        item.key ||
        ""
      ).toLowerCase();
    }

    return "";
  }

  function readFavorites() {
    const raw =
      localStorage.getItem("seasonPlannerEvents") ||
      localStorage.getItem("favorites");
    const parsed =
      raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed
      : [];
  }

  function writeLocalSeasonState(saved) {
    const seasonKey =
      getSeasonKey();
    const favorites =
      readFavorites()
        .filter(item =>
          normalizeFavoriteKey(item) !== seasonKey
        );

    if (saved) {
      favorites.push(seasonKey);
    }

    localStorage.setItem(
      "seasonPlannerEvents",
      JSON.stringify(favorites)
    );

    if (saved) {
      localStorage.setItem(
        "lastSeasonPlannerAdd",
        JSON.stringify({
          event_key: seasonKey,
          event_slug: detailEvent.event_slug || "",
          event_name: detailEvent.event_name || "",
          added_at: new Date().toISOString()
        })
      );
    }
  }

  function renderButton() {
    if (!seasonButton) {
      return;
    }

    const labelKey = isPending
      ? (
          isSaved
            ? "detail.removingSeason"
            : "detail.addingSeason"
        )
      : (
          isSaved
            ? "detail.savedSeason"
            : "detail.addSeason"
        );

    seasonButton.textContent =
      translate(labelKey);
    seasonButton.disabled =
      isPending;
    seasonButton.classList.toggle(
      "is-season-saved",
      isSaved
    );
    seasonButton.classList.toggle(
      "is-pending",
      isPending
    );
    seasonButton.setAttribute(
      "aria-pressed",
      isSaved ? "true" : "false"
    );
    seasonButton.setAttribute(
      "aria-busy",
      isPending ? "true" : "false"
    );
    seasonButton.setAttribute(
      "aria-label",
      translate(
        isSaved && !isPending
          ? "detail.removeSeason"
          : labelKey
      )
    );
    seasonButton.title =
      isSaved && !isPending
        ? translate("detail.removeSeason")
        : "";
  }

  function setStatus(key, tone) {
    lastStatusKey = key || "";
    lastStatusTone = tone || "";

    if (!actionStatus) {
      return;
    }

    actionStatus.textContent = key
      ? translate(key)
      : "";
    actionStatus.dataset.tone =
      lastStatusTone;
    if (key === "detail.loginRequired" && typeof document.createElement === "function" && actionStatus.append) {
      const actions = document.createElement("span");
      actions.className = "event-detail-action-group";
      for (const mode of ["login", "register"]) {
        const link = document.createElement("a");
        link.href = `/index.html?auth=${mode}#/planner`;
        link.className = "event-detail-secondary";
        link.textContent = translate(`detail.${mode}`);
        actions.append(link);
      }
      actionStatus.append(document.createElement("br"), actions);
    }
  }

  async function getCloudContext() {
    const testClient =
      window.__sportEventMapDetailSupabaseClient;

    if (testClient) {
      const { data } =
        await testClient.auth.getUser();

      return {
        client: testClient,
        user: data && data.user
      };
    }

    const appConfig =
      window.SPORT_EVENT_MAP_CONFIG || {};

    if (
      !appConfig.supabaseUrl ||
      !appConfig.supabasePublishableKey ||
      typeof window.ensureSupabaseFeaturesLoaded !== "function"
    ) {
      return {
        client: null,
        user: null
      };
    }

    await window.ensureSupabaseFeaturesLoaded(
      "event_detail_season"
    );

    const client =
      window.sportEventMapDetailSupabaseClient;

    if (!client) {
      return {
        client: null,
        user: null
      };
    }

    const { data } =
      await client.auth.getUser();

    return {
      client,
      user: data && data.user
    };
  }

  async function writeCloudTable(
    client,
    user,
    saved
  ) {
    if (saved) {
      return client
        .from("season_planner_events")
        .upsert(
          {
            user_id: user.id,
            event_id: getSeasonKey(),
            edition_id: detailEvent.edition_id || null
          },
          {
            onConflict: "user_id,event_id",
            ignoreDuplicates: true
          }
        );
    }

    return client
      .from("season_planner_events")
      .delete()
      .eq("user_id", user.id)
      .eq("event_id", getSeasonKey());
  }

  async function syncCloudState(
    client,
    user,
    nextSaved
  ) {
    const result =
      await writeCloudTable(
        client,
        user,
        nextSaved
      );

    if (!result?.error) {
      return;
    }

    await writeCloudTable(
      client,
      user,
      !nextSaved
    );

    throw result.error;
  }

  async function loadRemoteSeasonState() {
    try {
      const { client, user } =
        await getCloudContext();

      if (!user) {
        isSaved = false;
        setStatus("detail.loginRequired", "info");
        return;
      }
      if (!client || !user) {
        return;
      }

      const result =
        await client
          .from("season_planner_events")
          .select("event_id")
          .eq("user_id", user.id)
          .eq("event_id", getSeasonKey())
          .limit(1);

      if (result.error) {
        throw result.error;
      }

      const remoteSaved =
        Array.isArray(result.data) &&
        result.data.length > 0;

      writeLocalSeasonState(remoteSaved);
      isSaved = remoteSaved;
      renderButton();
    } catch (error) {
      console.warn(
        "Could not verify the Season Planner state.",
        error
      );
    }
  }

  async function toggleSeason() {
    if (isPending) {
      return;
    }

    let previousSaved =
      isSaved;

    isPending = true;
    setStatus("", "");
    renderButton();

    try {
      await initialStatePromise;

      previousSaved = isSaved;
      const nextSaved =
        !previousSaved;
      const { client, user } =
        await getCloudContext();

      if (!client || !user) {
        localStorage.setItem("pendingSeasonAdd", JSON.stringify({
          event_key: getSeasonKey(),
          event_slug: detailEvent.edition_slug || detailEvent.event_slug || "",
          requested_at: new Date().toISOString()
        }));
        isSaved = false;
        setStatus("detail.loginRequired", "info");
        return;
      }
      await syncCloudState(client, user, nextSaved);

      writeLocalSeasonState(nextSaved);
      isSaved = nextSaved;
      setStatus(
        nextSaved
          ? "detail.addedSeason"
          : "detail.removedSeason",
        "success"
      );
    } catch (error) {
      isSaved = previousSaved;
      setStatus(
        isSaved
          ? "detail.removeUnavailable"
          : "detail.saveUnavailable",
        "error"
      );
      console.warn(
        "Could not update the Season Planner.",
        error
      );
    } finally {
      isPending = false;
      renderButton();
    }
  }

  function initSeasonToggle() {
    if (!seasonButton) {
      return;
    }

    // A local cache cannot establish ownership or prove an authenticated save.
    isSaved = false;
    renderButton();
    seasonButton.addEventListener(
      "click",
      toggleSeason
    );

    initialStatePromise =
      loadRemoteSeasonState();
  }

  function setActiveSection(sectionId) {
    document
      .querySelectorAll("[data-detail-section]")
      .forEach(link => {
        const active =
          link.dataset.detailSection === sectionId;

        link.classList.toggle(
          "is-active",
          active
        );

        if (active) {
          link.setAttribute(
            "aria-current",
            "location"
          );
        } else {
          link.removeAttribute("aria-current");
        }
      });
  }

  let sectionObserver = null;
  const boundSectionLinks = new WeakSet();
  function initSectionNavigation() {
    sectionObserver?.disconnect();
    const links = [
      ...document.querySelectorAll(
        "[data-detail-section]"
      )
    ];

    if (!links.length) {
      return;
    }

    const sections =
      links
        .map(link =>
          document.getElementById(
            link.dataset.detailSection
          )
        )
        .filter(Boolean);

    links.forEach(link => {
      if (boundSectionLinks.has(link)) return;
      boundSectionLinks.add(link);
      link.addEventListener("click", event => {
        const target =
          document.getElementById(
            link.dataset.detailSection
          );

        if (!target) {
          return;
        }

        event.preventDefault();
        setActiveSection(target.id);
        target.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
        history.replaceState(
          null,
          "",
          `#${target.id}`
        );
      });
    });

    const hashId =
      window.location.hash.slice(1);

    setActiveSection(
      sections.some(section => section.id === hashId)
        ? hashId
        : sections[0].id
    );

    if (!("IntersectionObserver" in window)) {
      return;
    }

    sectionObserver =
      new IntersectionObserver(
        entries => {
          const visible =
            entries
              .filter(entry => entry.isIntersecting)
              .sort((a, b) =>
                a.boundingClientRect.top -
                b.boundingClientRect.top
              )[0];

          if (visible) {
            setActiveSection(visible.target.id);
          }
        },
        {
          rootMargin: "-12% 0px -62% 0px",
          threshold: [0, 0.15, 0.4]
        }
      );

    sections.forEach(section =>
      sectionObserver.observe(section)
    );
  }

  window.addEventListener(
    "sport-event-map-detail-languagechange",
    function () {
      renderButton();

      if (lastStatusKey) {
        setStatus(
          lastStatusKey,
          lastStatusTone
        );
      }
    }
  );

  window.addEventListener("sport-event-map-detail-contentchange", initSectionNavigation);
  initSeasonToggle();
  initSectionNavigation();
})();
