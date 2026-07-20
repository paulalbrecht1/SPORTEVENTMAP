(function () {
  const currentScript =
    document.currentScript;

  const sdkPrimary =
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js";

  const sdkFallback =
    "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js";

  const appScript =
    currentScript?.dataset?.supabaseSrc ||
    "js/supabase.js";

  const queuedAnalyticsEvents = [];

  let loadPromise = null;
  let isLoaded = false;
  let replayingClick = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing =
        document.querySelector(`script[data-loaded-src="${src}"]`);

      if (existing?.dataset.loaded === "true") {
        resolve();
        return;
      }

      const script =
        existing || document.createElement("script");

      script.src = src;
      script.defer = true;
      script.dataset.loadedSrc = src;

      script.onload = () => {
        script.dataset.loaded = "true";
        resolve();
      };

      script.onerror = () => {
        reject(new Error(`Could not load ${src}`));
      };

      if (!existing) {
        document.head.appendChild(script);
      }
    });
  }

  function flushQueuedAnalyticsEvents() {
    const realTrackEvent =
      window.trackEvent;

    if (
      typeof realTrackEvent !== "function" ||
      realTrackEvent === queueTrackEvent
    ) {
      return;
    }

    queuedAnalyticsEvents
      .splice(0)
      .forEach(entry => {
        try {
          realTrackEvent(
            entry.eventName,
            entry.metadata
          );
        } catch (error) {
          console.warn(
            "Queued analytics event could not be sent:",
            entry.eventName,
            error
          );
        }
      });
  }

  function queueTrackEvent(eventName, metadata = {}) {
    queuedAnalyticsEvents.push({
      eventName,
      metadata
    });

    if (queuedAnalyticsEvents.length > 80) {
      queuedAnalyticsEvents.shift();
    }

    scheduleSupabaseLoad("analytics");
  }

  if (typeof window.trackEvent !== "function") {
    window.trackEvent =
      queueTrackEvent;
  }

  function refreshCloudBackedState() {
    flushQueuedAnalyticsEvents();

    if (typeof window.refreshEvents === "function") {
      window.setTimeout(
        () => window.refreshEvents({
          preserveView: true,
          source: "supabase_lazy_load"
        }),
        80
      );
    }
  }

  function ensureSupabaseFeaturesLoaded(reason = "manual") {
    if (isLoaded) {
      return Promise.resolve();
    }

    if (loadPromise) {
      return loadPromise;
    }

    loadPromise =
      loadScript(sdkPrimary)
        .catch(() => loadScript(sdkFallback))
        .then(() => loadScript(appScript))
        .then(() => {
          isLoaded = true;
          document.documentElement.dataset.supabaseLoaded =
            "true";
          refreshCloudBackedState();
        })
        .catch(error => {
          loadPromise = null;
          console.warn(
            `Supabase features could not be lazy-loaded (${reason}).`,
            error
          );
        });

    return loadPromise;
  }

  function scheduleSupabaseLoad(reason) {
    const run =
      () => ensureSupabaseFeaturesLoaded(reason);

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, {
        timeout: 3200
      });
      return;
    }

    window.setTimeout(run, 1200);
  }

  const interactiveSelectors = [
    "#loginBtn",
    "#registerBtn",
    "#profileBtn",
    "#adminBtn",
    "#addEventBtn",
    "#feedbackBtn",
    "#betaFeedbackBtn",
    "#landingAddEventBtn",
    "#submitFeedbackBtn",
    "#submitEventBtn",
    "#authSubmitBtn",
    "#passwordResetBtn",
    "#profilePasswordBtn",
    "#profilePasswordResetBtn",
    "#profileEmailBtn"
  ].join(",");

  document.addEventListener(
    "click",
    event => {
      if (
        isLoaded ||
        replayingClick
      ) {
        return;
      }

      const target =
        event.target.closest(interactiveSelectors);

      if (!target) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      ensureSupabaseFeaturesLoaded("interaction")
        .then(() => {
          replayingClick = true;
          target.click();
          replayingClick = false;
        });
    },
    true
  );

  document.addEventListener(
    "pointerover",
    event => {
      if (
        !isLoaded &&
        event.target.closest(interactiveSelectors)
      ) {
        ensureSupabaseFeaturesLoaded("intent");
      }
    },
    {
      passive: true
    }
  );

  window.ensureSupabaseFeaturesLoaded =
    ensureSupabaseFeaturesLoaded;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => scheduleSupabaseLoad("idle"),
      {
        once: true
      }
    );
  } else {
    scheduleSupabaseLoad("idle");
  }
})();
