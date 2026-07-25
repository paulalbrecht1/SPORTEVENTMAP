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
    ? new URL("theme.js", currentScript.src).href
    : "../../js/theme.js";
  const themeScript = document.createElement("script");

  themeScript.src = themeUrl;
  themeScript.dataset.globalThemeLoader = "true";
  themeScript.addEventListener("load", () => {
    window.SportEventMapTheme?.ensureControls();
  });
  document.head.appendChild(themeScript);
})();

(function () {
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

  function translate(key) {
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
      localStorage.getItem("favorites");
    const parsed =
      raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed
      : [];
  }

  function hasLocalSeasonEntry() {
    const seasonKey =
      getSeasonKey();

    try {
      return readFavorites().some(item =>
        normalizeFavoriteKey(item) === seasonKey
      );
    } catch (_error) {
      return false;
    }
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
      "favorites",
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
      !appConfig.supabaseAnonKey ||
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
    table,
    saved
  ) {
    if (saved) {
      return client
        .from(table)
        .upsert(
          {
            user_id: user.id,
            event_id: getSeasonKey()
          },
          {
            onConflict: "user_id,event_id",
            ignoreDuplicates: true
          }
        );
    }

    return client
      .from(table)
      .delete()
      .eq("user_id", user.id)
      .eq("event_id", getSeasonKey());
  }

  async function syncCloudState(
    client,
    user,
    nextSaved
  ) {
    const tables = [
      "favorites",
      "season_planner_events"
    ];
    const results =
      await Promise.all(
        tables.map(table =>
          writeCloudTable(
            client,
            user,
            table,
            nextSaved
          )
        )
      );
    const failed =
      results.find(result => result && result.error);

    if (!failed) {
      return;
    }

    await Promise.allSettled(
      tables.map(table =>
        writeCloudTable(
          client,
          user,
          table,
          !nextSaved
        )
      )
    );

    throw failed.error;
  }

  async function loadRemoteSeasonState() {
    try {
      const { client, user } =
        await getCloudContext();

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

      if (client && user) {
        await syncCloudState(
          client,
          user,
          nextSaved
        );
      }

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

    isSaved = hasLocalSeasonEntry();
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

  function initSectionNavigation() {
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

    const observer =
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
      observer.observe(section)
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

  initSeasonToggle();
  initSectionNavigation();
})();
