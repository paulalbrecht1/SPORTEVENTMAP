const APP_CONFIG =
  window.SPORT_EVENT_MAP_CONFIG || {};

const SUPABASE_URL =
  APP_CONFIG.supabaseUrl || "";

const SUPABASE_ANON_KEY =
  APP_CONFIG.supabaseAnonKey || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase config missing. Check js/config.js before publishing."
  );
}

function createUnavailableSupabaseClient() {
  const unavailableError = {
    message:
      "Supabase is currently unavailable. Please check your connection and try again."
  };

  function createQueryResult() {
    return {
      select() { return this; },
      eq() { return this; },
      neq() { return this; },
      in() { return this; },
      gte() { return this; },
      lte() { return this; },
      limit() { return this; },
      order() { return this; },
      update() { return this; },
      delete() { return this; },
      insert: async () => ({
        data: null,
        error: unavailableError
      }),
      upsert: async () => ({
        data: null,
        error: unavailableError
      }),
      maybeSingle: async () => ({
        data: null,
        error: unavailableError
      }),
      single: async () => ({
        data: null,
        error: unavailableError
      }),
      then(resolve) {
        resolve({
          data: [],
          error: unavailableError
        });
      }
    };
  }

  return {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: unavailableError
      }),
      getSession: async () => ({
        data: { session: null },
        error: null
      }),
      signInWithPassword: async () => ({
        data: null,
        error: unavailableError
      }),
      signUp: async () => ({
        data: null,
        error: unavailableError
      }),
      signOut: async () => ({
        error: null
      }),
      updateUser: async () => ({
        data: null,
        error: unavailableError
      }),
      resetPasswordForEmail: async () => ({
        data: null,
        error: unavailableError
      }),
      onAuthStateChange() {
        return {
          data: {
            subscription: {
              unsubscribe() {}
            }
          }
        };
      }
    },
    from() {
      return createQueryResult();
    }
  };
}

const supabaseClient =
  typeof supabase !== "undefined" &&
  supabase &&
  typeof supabase.createClient === "function" &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY
    ? supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      )
    : createUnavailableSupabaseClient();

if (
  typeof supabase !== "undefined" &&
  supabase &&
  typeof supabase.createClient === "function" &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY
) {
  console.log("Supabase connected");
} else {
  console.warn(
    "Supabase SDK unavailable. Auth and cloud sync are disabled, but CSV events can still load."
  );
}

let authMode = "login";
let currentUserRole = "guest";
let eventModalOpenedAt = 0;
let analyticsUserPromise = null;

const EVENT_SUBMIT_COOLDOWN_MS =
  60 * 1000;

const EVENT_MODAL_MIN_OPEN_MS =
  2500;

const EVENT_LAST_SUBMIT_KEY =
  "sportEventMap.lastEventSubmitAt";

const ANALYTICS_SESSION_KEY =
  "sportEventMap.analyticsSessionId";

const ANALYTICS_ANONYMOUS_KEY =
  "sportEventMap.analyticsAnonymousId";

const FEEDBACK_EMAIL =
  APP_CONFIG.feedbackEmail ||
  "feedback@[your-domain].com";

const ANALYTICS_EVENT_ALIASES = {
  search_used: "search_performed",
  filter_used: "filter_changed",
  event_opened: "event_detail_opened",
  season_event_added: "planner_event_added",
  season_event_removed: "planner_event_removed",
  season_distance_selected: "planned_distance_changed",
  planner_opened: "season_planner_opened",
  feedback_sent: "feedback_submitted",
  landing_cta_discover_clicked: "hero_cta_clicked",
  landing_cta_season_clicked: "secondary_cta_clicked"
};

const ALLOWED_ANALYTICS_EVENTS =
  new Set([
    "app_opened",
    "landing_viewed",
    "map_viewed",
    "season_planner_opened",
    "admin_opened",
    "feedback_opened",
    "signup_started",
    "signup_completed",
    "login_completed",
    "logout_completed",
    "password_reset_started",
    "search_performed",
    "filter_changed",
    "sort_changed",
    "event_card_clicked",
    "event_detail_opened",
    "external_event_website_clicked",
    "favorite_added",
    "favorite_removed",
    "planner_event_added",
    "planner_event_removed",
    "planner_priority_changed",
    "planned_distance_changed",
    "personal_note_added_or_updated",
    "planner_detail_updated",
    "calendar_month_changed",
    "recommendation_clicked",
    "calendar_exported",
    "event_submitted",
    "feedback_started",
    "feedback_submitted",
    "hero_cta_clicked",
    "secondary_cta_clicked",
    "beta_info_opened",
    "search_used",
    "filter_used",
    "event_opened",
    "favorite_added",
    "favorite_removed",
    "season_event_added",
    "season_event_removed",
    "season_distance_selected",
    "planner_opened",
    "recommendation_clicked",
    "calendar_exported",
    "event_submitted",
    "feedback_sent",
    "landing_cta_discover_clicked",
    "landing_cta_season_clicked"
  ]);

function getConfiguredSiteUrl() {
  const configured =
    String(APP_CONFIG.siteUrl || "")
      .trim()
      .replace(/\/+$/, "");

  if (configured) {
    return configured;
  }

  return window.location.origin;
}

function getAuthRedirectUrl(action) {
  const path =
    action === "password-reset"
      ? APP_CONFIG.passwordResetPath
      : APP_CONFIG.authCallbackPath;

  const url =
    new URL(
      String(path || "index.html").replace(/^\/+/, ""),
      `${getConfiguredSiteUrl()}/`
    );

  url.searchParams.set(
    "auth_action",
    action
  );

  return url.toString();
}

function setButtonLoading(button, loading, loadingLabel = "Working...") {
  if (!button) {
    return;
  }

  if (loading) {
    button.dataset.defaultLabel =
      button.textContent.trim();
    button.textContent =
      loadingLabel;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    return;
  }

  button.textContent =
    button.dataset.defaultLabel ||
    button.textContent;
  button.disabled = false;
  button.removeAttribute("aria-busy");
}

function getFriendlyErrorMessage(error, fallback) {
  const message =
    String(error?.message || "")
      .toLowerCase();

  if (
    message.includes("failed to fetch") ||
    message.includes("network")
  ) {
    return "The service could not be reached. Check your connection and try again.";
  }

  if (message.includes("invalid login credentials")) {
    return "Login fehlgeschlagen. Bitte überprüfe E-Mail und Passwort.";
  }

  if (message.includes("email not confirmed")) {
    return "Please confirm your email address before signing in.";
  }

  if (message.includes("session")) {
    return "Your session has expired. Please sign in again.";
  }

  if (message.includes("row-level security")) {
    return "This action is not permitted for your account.";
  }

  return fallback;
}

function getCurrentAnalyticsSessionId() {
  let sessionId =
    sessionStorage.getItem(ANALYTICS_SESSION_KEY);

  if (!sessionId) {
    sessionId =
      crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    sessionStorage.setItem(
      ANALYTICS_SESSION_KEY,
      sessionId
    );
  }

  return sessionId;
}

function getAnalyticsAnonymousId() {
  let anonymousId =
    localStorage.getItem(ANALYTICS_ANONYMOUS_KEY);

  if (!anonymousId) {
    anonymousId =
      crypto.randomUUID
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    localStorage.setItem(
      ANALYTICS_ANONYMOUS_KEY,
      anonymousId
    );
  }

  return anonymousId;
}

function normalizeAnalyticsEventName(eventName) {
  return (
    ANALYTICS_EVENT_ALIASES[eventName] ||
    eventName
  );
}

function getAnalyticsPageContext() {
  if (document.body.classList.contains("landing-open")) {
    return "landing";
  }

  if (
    document
      .getElementById("seasonPlannerModal")
      ?.classList.contains("open")
  ) {
    return "season_planner";
  }

  if (
    document
      .getElementById("adminModal")
      ?.classList.contains("open")
  ) {
    return "admin";
  }

  if (
    document
      .getElementById("profileModal")
      ?.classList.contains("open")
  ) {
    return "profile";
  }

  if (document.body.classList.contains("event-list-fullscreen")) {
    return "event_list_fullscreen";
  }

  return "event_map";
}

function sanitizeAnalyticsMetadata(metadata = {}) {
  const sanitized = {};

  Object.entries(metadata || {})
    .forEach(([key, value]) => {
      const normalizedKey =
        key.toLowerCase();

      if (
        normalizedKey.includes("email") ||
        normalizedKey.includes("password") ||
        normalizedKey.includes("token") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("note") ||
        normalizedKey.includes("message")
      ) {
        return;
      }

      if (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "number"
      ) {
        sanitized[key] = value;
        return;
      }

      if (typeof value === "string") {
        sanitized[key] =
          value
            .trim()
            .slice(0, normalizedKey === "query" ? 120 : 100);
        return;
      }

      if (Array.isArray(value)) {
        sanitized[key] =
          value
            .slice(0, 8)
            .map(item =>
              String(item).slice(0, 60)
            );
        return;
      }

      if (
        value &&
        typeof value === "object"
      ) {
        sanitized[key] =
          Object.fromEntries(
            Object.entries(value)
              .slice(0, 12)
              .map(([innerKey, innerValue]) => [
                String(innerKey).slice(0, 60),
                String(innerValue).slice(0, 80)
              ])
          );
      }
    });

  return sanitized;
}

async function getAnalyticsUserId() {
  if (
    typeof supabaseClient === "undefined" ||
    !supabaseClient.auth
  ) {
    return null;
  }

  if (!analyticsUserPromise) {
    analyticsUserPromise =
      supabaseClient.auth.getUser()
        .then(({ data }) => data?.user?.id || null)
        .catch(() => null);
  }

  return analyticsUserPromise;
}

async function trackEvent(eventName, metadata = {}) {
  try {
    const normalizedEventName =
      normalizeAnalyticsEventName(eventName);

    if (
      !ALLOWED_ANALYTICS_EVENTS.has(eventName) ||
      !ALLOWED_ANALYTICS_EVENTS.has(normalizedEventName) ||
      typeof supabaseClient === "undefined"
    ) {
      return;
    }

    const eventId =
      metadata.event_id ||
      metadata.eventId ||
      null;

    const payload = {
      event_name: normalizedEventName,
      event_type: normalizedEventName,
      user_id: await getAnalyticsUserId(),
      anonymous_id: getAnalyticsAnonymousId(),
      session_id: getCurrentAnalyticsSessionId(),
      event_id: eventId ? String(eventId).slice(0, 160) : null,
      page:
        String(metadata.page || getAnalyticsPageContext())
          .slice(0, 80),
      source:
        String(metadata.source || "web_app")
          .slice(0, 80),
      metadata: sanitizeAnalyticsMetadata(metadata)
    };

    let { error } =
      await supabaseClient
        .from("analytics_events")
        .insert([payload]);

    if (
      error &&
      (
        String(error.message || "")
          .toLowerCase()
          .includes("event_type") ||
        String(error.message || "")
          .toLowerCase()
          .includes("anonymous_id") ||
        String(error.message || "")
          .toLowerCase()
          .includes("page") ||
        String(error.message || "")
          .toLowerCase()
          .includes("source")
      )
    ) {
      const fallback =
        await supabaseClient
          .from("analytics_events")
          .insert([{
            event_name: payload.event_name,
            user_id: payload.user_id,
            session_id: payload.session_id,
            event_id: payload.event_id,
            metadata: payload.metadata
          }]);

      error =
        fallback.error;
    }

    if (error) {
      console.warn(
        "Analytics event not saved:",
        normalizedEventName,
        error.message
      );
    }
  } catch (error) {
    console.warn(
      "Analytics tracking failed:",
      eventName,
      error
    );
  }
}

window.trackEvent =
  trackEvent;

window.addEventListener(
  "load",
  () => {
    trackEvent("app_opened", {
      page:
        getAnalyticsPageContext()
    });
  },
  {
    once: true
  }
);

async function submitUserFeedback() {
  const submitButton =
    document.getElementById("submitFeedbackBtn");

  const messageElement =
    document.getElementById("feedbackMessage");

  const ratingElement =
    document.getElementById("feedbackRating");

  const categoryElement =
    document.getElementById("feedbackCategory");

  const productAreaElement =
    document.getElementById("feedbackProductArea");

  const summaryElement =
    document.getElementById("feedbackSummary");

  const eventIdElement =
    document.getElementById("feedbackEventId");

  const screenshotElement =
    document.getElementById("feedbackScreenshotHint");

  const message =
    messageElement
      ? messageElement.value.trim()
      : "";

  const summary =
    summaryElement
      ? summaryElement.value.trim()
      : "";

  const rating =
    ratingElement && ratingElement.value
      ? Number(ratingElement.value)
      : null;

  if (!summary) {
    showAppMessage(
      "Short description required",
      "Please add a short description so the beta team can review this feedback."
    );

    return;
  }

  setButtonLoading(
    submitButton,
    true,
    "Sending..."
  );

  try {
    const { error } =
      await supabaseClient
        .from("user_feedback")
        .insert([{
          user_id: await getAnalyticsUserId(),
          session_id: getCurrentAnalyticsSessionId(),
          rating,
          category:
            categoryElement?.value || "other",
          summary: summary.slice(0, 180),
          message: message.slice(0, 2000),
          page: document.body.classList.contains("event-list-fullscreen")
            ? "event_list_fullscreen"
            : document.getElementById("seasonPlannerModal")
              ?.classList.contains("open")
              ? "season_planner"
              : document.getElementById("profileModal")
                ?.classList.contains("open")
                ? "profile"
                : "event_map",
          product_area:
            productAreaElement?.value || "other",
          event_id:
            eventIdElement?.value.trim().slice(0, 160) || null,
          screenshot_hint:
            screenshotElement?.value.trim().slice(0, 240) || null
        }]);

    if (error) {
      console.warn(
        "Feedback not saved:",
        error.message
      );

      showAppMessage(
        "Feedback failed",
        getFriendlyErrorMessage(
          error,
          "Feedback could not be saved. Please try again shortly."
        )
      );

      return;
    }

    messageElement.value = "";
    summaryElement.value = "";

    if (eventIdElement) {
      eventIdElement.value = "";
    }

    if (screenshotElement) {
      screenshotElement.value = "";
    }

    if (ratingElement) {
      ratingElement.value = "";
    }

    document
      .querySelectorAll("[data-feedback-rating]")
      .forEach(button =>
        button.classList.remove("active")
      );

    document
      .getElementById("feedbackModal")
      ?.classList
      .remove("open");

    showAppMessage(
      "Feedback sent",
      "Thanks. Your feedback helps prioritize the next improvements."
    );

    trackEvent("feedback_submitted", {
      category:
        categoryElement?.value || "other",
      product_area:
        productAreaElement?.value || "other"
    });
  } catch (error) {
    console.warn(
      "Feedback submit failed:",
      error
    );

    showAppMessage(
      "Feedback failed",
      getFriendlyErrorMessage(
        error,
        "Feedback could not be sent. Please try again."
      )
    );
  } finally {
    setButtonLoading(
      submitButton,
      false
    );
  }
}

window.submitUserFeedback =
  submitUserFeedback;


const authModal =
  document.getElementById("authModal");

const authTitle =
  document.getElementById("authTitle");

const authEmail =
  document.getElementById("authEmail");

const authPassword =
  document.getElementById("authPassword");

const authSubmitBtn =
  document.getElementById("authSubmitBtn");

const addEventBtn =
  document.getElementById("addEventBtn");

const adminBtn =
  document.getElementById("adminBtn");

const profileBtn =
  document.getElementById("profileBtn");

const feedbackBtn =
  document.getElementById("feedbackBtn");

const feedbackModal =
  document.getElementById("feedbackModal");

const feedbackEmailLink =
  document.getElementById("feedbackEmailLink");

const betaFeedbackBtn =
  document.getElementById("betaFeedbackBtn");

const profileModal =
  document.getElementById("profileModal");

const appMessageModal =
  document.getElementById("appMessageModal");

const appMessageTitle =
  document.getElementById("appMessageTitle");

const appMessageText =
  document.getElementById("appMessageText");

if (feedbackEmailLink) {
  feedbackEmailLink.textContent =
    FEEDBACK_EMAIL;

  feedbackEmailLink.href =
    `mailto:${FEEDBACK_EMAIL.replace(/^mailto:/, "")}`;
}

function openFeedbackModal() {
  if (!feedbackModal) {
    return;
  }

  const productArea =
    document.getElementById("feedbackProductArea");

  if (productArea) {
    if (
      document.getElementById("seasonPlannerModal")
        ?.classList.contains("open")
    ) {
      productArea.value = "season_planner";
    } else if (
      document.getElementById("eventDrawer")
        ?.classList.contains("open")
    ) {
      productArea.value = "event_details";
    } else if (
      document.body.classList.contains("event-list-fullscreen")
    ) {
      productArea.value = "filters";
    } else {
      productArea.value = "event_map";
    }
  }

  feedbackModal.classList.add("open");

  if (typeof trackEvent === "function") {
    trackEvent("feedback_opened", {
      product_area:
        productArea?.value || "event_map"
    });
    trackEvent("feedback_started", {
      product_area:
        productArea?.value || "event_map"
    });
  }
}

function getToastStack() {
  let stack =
    document.getElementById("appToastStack");

  if (!stack) {
    stack =
      document.createElement("div");

    stack.id =
      "appToastStack";

    stack.className =
      "app-toast-stack";

    document.body.appendChild(stack);
  }

  return stack;
}

function showToast(title, message) {
  const stack =
    getToastStack();

  const toast =
    document.createElement("div");

  toast.className =
    "app-toast";

  toast.innerHTML = `
    <strong>${String(title || "Notice")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</strong>
    <span>${String(message || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</span>
  `;

  stack.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  setTimeout(() => {
    toast.classList.add("is-hiding");
    toast.classList.remove("is-visible");
  }, 2600);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

window.showToast =
  showToast;

function clearEventSubmitStatus() {
  const status =
    document.getElementById("eventSubmitStatus");

  if (!status) {
    return;
  }

  status.hidden = true;
  status.className = "event-submit-status";
  status.innerHTML = "";
}

function showEventSubmitStatus(title, message, type = "error") {
  const eventModalElement =
    document.getElementById("eventModal");

  const status =
    document.getElementById("eventSubmitStatus");

  if (
    !eventModalElement?.classList.contains("open") ||
    !status
  ) {
    return false;
  }

  status.hidden = false;
  status.className =
    `event-submit-status ${type}`.trim();
  status.innerHTML = `
    <strong>${String(title || "Notice")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</strong>
    <span>${String(message || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</span>
  `;

  status.scrollIntoView({
    block: "nearest",
    behavior:
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth"
  });

  return true;
}

function showEventSubmitError(title, message) {
  if (
    showEventSubmitStatus(
      title,
      message,
      "error"
    )
  ) {
    return;
  }

  showAppMessage(
    title,
    message
  );
}


function showAppMessage(title, message) {

  if (showEventSubmitStatus(title, message)) {
    return;
  }

  if (document.body) {
    showToast(title, message);
    return;
  }

  if (
    !appMessageModal ||
    !appMessageTitle ||
    !appMessageText
  ) {

    alert(message || title);

    return;

  }

  appMessageTitle.innerText =
    title || "Notice";

  appMessageText.innerText =
    message || "";

  appMessageModal.classList.add("open");

}


function closeAppMessage() {

  if (appMessageModal) {

    appMessageModal.classList.remove("open");

  }

}


document
  .getElementById("closeAppMessage")
  .addEventListener("click", closeAppMessage);

document
  .getElementById("appMessageOk")
  .addEventListener("click", closeAppMessage);


function openAuthModal(mode) {

  authMode = mode;

  authModal.classList.add("open");

  authTitle.innerText =
    mode === "login"
    ? (
        typeof window.t === "function"
          ? window.t("auth.welcome", "Welcome Back")
          : "Welcome Back"
      )
    : (
        typeof window.t === "function"
          ? window.t("auth.create", "Create Account")
          : "Create Account"
      );

}


function closeAuthModal() {

  authModal.classList.remove("open");

}


async function handleAuth() {
  const email =
    authEmail.value.trim();

  const password =
    authPassword.value;

  if (!email || !password) {
    showAppMessage(
      "Missing credentials",
      "Please enter your email address and password."
    );
    return;
  }

  setButtonLoading(
    authSubmitBtn,
    true,
    authMode === "register"
      ? "Creating account..."
      : "Signing in..."
  );

  try {
    if (authMode === "register") {
      trackEvent("signup_started", {
        page: "auth"
      });

      const { data, error } =
        await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              getAuthRedirectUrl("email-confirmation")
          }
        });

      if (error) {
        showAppMessage(
          "Registration failed",
          getFriendlyErrorMessage(
            error,
            "The account could not be created. Please review the details and try again."
          )
        );
        return;
      }

      showAppMessage(
        "Account created",
        data?.session
          ? "Your account is ready and you are signed in."
          : "Registration successful. Please confirm your email address using the link in your inbox."
      );

      analyticsUserPromise = null;

      trackEvent("signup_completed", {
        signed_in:
          Boolean(data?.session),
        page: "auth"
      });
    }

    if (authMode === "login") {
      const { error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        showAppMessage(
          "Login failed",
          getFriendlyErrorMessage(
            error,
            "Login fehlgeschlagen. Bitte überprüfe E-Mail und Passwort."
          )
        );
        return;
      }

      showAppMessage(
        "Login successful",
        "Welcome back. Your profile and saved events are now available."
      );

      analyticsUserPromise = null;

      trackEvent("login_completed", {
        page: "auth"
      });
    }

    authPassword.value = "";
    closeAuthModal();
    await updateAuthUI();
  } catch (error) {
    console.error("Authentication request failed:", error);
    showAppMessage(
      "Authentication unavailable",
      getFriendlyErrorMessage(
        error,
        "Authentication is temporarily unavailable. Please try again."
      )
    );
  } finally {
    setButtonLoading(
      authSubmitBtn,
      false
    );
  }

}


document
  .getElementById("loginBtn")
  .addEventListener("click", () => {

    openAuthModal("login");

  });


document
  .getElementById("registerBtn")
  .addEventListener("click", () => {

    openAuthModal("register");

  });


document
  .getElementById("closeAuthModal")
  .addEventListener("click", closeAuthModal);


authSubmitBtn.onclick = handleAuth;


async function sendPasswordReset() {

  const email =
    authEmail.value.trim();

  if (!email) {

    showAppMessage(
      "Email required",
      "Please enter your email address first."
    );

    return;

  }

  const resetButton =
    document.getElementById("passwordResetBtn");

  setButtonLoading(
    resetButton,
    true,
    "Sending..."
  );

  const { error } =
    await supabaseClient.auth.resetPasswordForEmail(
      email,
      {
        redirectTo:
          getAuthRedirectUrl("password-reset")
      }
    );

  if (error) {

    showAppMessage(
      "Reset failed",
      getFriendlyErrorMessage(
        error,
        "The reset email could not be sent. Please try again."
      )
    );

    setButtonLoading(resetButton, false);
    return;

  }

  showAppMessage(
    "Password reset sent",
    "Check your email for a password reset link."
  );

  trackEvent("password_reset_started", {
    page: "auth"
  });

  setButtonLoading(resetButton, false);
}


document
  .getElementById("passwordResetBtn")
  .addEventListener("click", sendPasswordReset);

async function logout() {
  const { error } =
    await supabaseClient.auth.signOut();

  if (error) {
    console.error("Logout failed:", error);
    showAppMessage(
      "Logout failed",
      getFriendlyErrorMessage(
        error,
        "You could not be signed out. Please try again."
      )
    );
    return;
  }

  await updateAuthUI();

  showAppMessage(
    "Logged out",
    "You have been signed out."
  );

  trackEvent("logout_completed", {
    page: "auth"
  });

  analyticsUserPromise = null;

}


function getProfileFavoriteEvents() {

  try {

    if (
      typeof events === "undefined" ||
      typeof isFavorite !== "function"
    ) {

      return [];

    }

    return events
      .filter(event => isFavorite(event));

  }
  catch (error) {

    console.warn(
      "Could not load favorite events for profile.",
      error
    );

    return [];

  }

}


function getProfileFavoriteKey(event) {

  if (typeof getEventKey === "function") {

    return getEventKey(event);

  }

  return [
    event.event_name,
    event.date,
    event.city
  ]
    .map(value => String(value || "").trim())
    .join("|")
    .toLowerCase();

}


function syncValidProfileFavorites(favoriteEvents) {

  if (
    typeof events === "undefined" ||
    !Array.isArray(events) ||
    !events.length
  ) {

    return;

  }

  const validKeys =
    favoriteEvents.map(event =>
      getProfileFavoriteKey(event)
    );

  try {

    localStorage.setItem(
      "favorites",
      JSON.stringify(validKeys)
    );

    if (typeof favorites !== "undefined") {

      favorites = validKeys;

    }

  }
  catch (error) {

    console.warn(
      "Could not sync valid profile favorites.",
      error
    );

  }

}


function parseProfileDate(value) {

  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      String(value || "").trim()
    );

  if (!match) {

    return null;

  }

  const parsed =
    new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

  parsed.setHours(0, 0, 0, 0);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed;

}


function sortFavoritesByNextDate(favoriteEvents) {

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return [...favoriteEvents].sort((first, second) => {

    const firstDate =
      parseProfileDate(first.date);

    const secondDate =
      parseProfileDate(second.date);

    const firstTime =
      firstDate && firstDate >= today
        ? firstDate.getTime()
        : Number.MAX_SAFE_INTEGER;

    const secondTime =
      secondDate && secondDate >= today
        ? secondDate.getTime()
        : Number.MAX_SAFE_INTEGER;

    if (firstTime !== secondTime) {

      return firstTime - secondTime;

    }

    return String(first.event_name || "")
      .localeCompare(
        String(second.event_name || "")
      );

  });

}


function escapeProfileHTML(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function getFavoriteCount() {

  return getProfileFavoriteEvents().length;

}


function getUpcomingProfileFavoriteEvents(favoriteEvents) {

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return favoriteEvents.filter(event => {

    const date =
      parseProfileDate(event.date);

    return date && date >= today;

  });

}

function getCompletedProfileEvents(favoriteEvents) {
  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return favoriteEvents
    .filter(event => {
      const date =
        parseProfileDate(event.date);

      return date && date < today;
    })
    .sort((first, second) => {
      const firstDate =
        parseProfileDate(first.date);

      const secondDate =
        parseProfileDate(second.date);

      return (
        (secondDate?.getTime() || 0) -
        (firstDate?.getTime() || 0)
      );
    });
}

function getProfileTrophyLabel(completedCount) {
  if (completedCount >= 20) {
    return "20 races completed";
  }

  if (completedCount >= 10) {
    return "10 races completed";
  }

  if (completedCount >= 5) {
    return "5 races completed";
  }

  return completedCount
    ? `${completedCount} completed`
    : "Start building";
}

const PROFILE_ACHIEVEMENT_LEVELS = [
  {
    count: 5,
    icon: "🏁",
    label: "5 Events"
  },
  {
    count: 10,
    icon: "🥉",
    label: "10 Events"
  },
  {
    count: 20,
    icon: "🥈",
    label: "20 Events"
  },
  {
    count: 50,
    icon: "🥇",
    label: "50 Events"
  },
  {
    count: 100,
    icon: "🏆",
    label: "100 Events"
  }
];

function renderProfileAchievementBadges(completedCount) {
  const badgeGrid =
    document.getElementById("profileAchievementBadges");

  if (!badgeGrid) {
    return;
  }

  badgeGrid.innerHTML =
    PROFILE_ACHIEVEMENT_LEVELS
      .map(level => {
        const unlocked =
          completedCount >= level.count;

        return `
          <article class="profile-achievement-card ${unlocked ? "is-unlocked" : "is-locked"}">
            <span class="profile-achievement-icon" aria-hidden="true">${level.icon}</span>
            <strong>${escapeProfileHTML(level.label)}</strong>
            <small>${unlocked ? "Unlocked" : `${Math.max(level.count - completedCount, 0)} to go`}</small>
          </article>
        `;
      })
      .join("");
}

function renderProfileCompletedEvents(favoriteEvents) {
  const list =
    document.getElementById("profileCompletedEvents");

  const countElement =
    document.getElementById("profileCompletedCount");

  const trophyElement =
    document.getElementById("profileTrophyStatus");

  if (!list) {
    return;
  }

  const completedEvents =
    getCompletedProfileEvents(favoriteEvents);

  if (countElement) {
    countElement.textContent =
      `${completedEvents.length} completed`;
  }

  if (trophyElement) {
    trophyElement.textContent =
      getProfileTrophyLabel(completedEvents.length);
  }

  renderProfileAchievementBadges(
    completedEvents.length
  );

  renderProfileCompletedArchive(
    favoriteEvents
  );

  if (!completedEvents.length) {
    list.innerHTML = `
      <div class="profile-completed-empty">
        <strong>No completed races yet</strong>
        <span>Plan your first race in Season Planner. Past planned races unlock achievements here.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = `
    <div class="profile-completed-empty is-success">
      <strong>${completedEvents.length} completed race${completedEvents.length === 1 ? "" : "s"}</strong>
      <span>Your completed planned races are counted toward achievement badges.</span>
    </div>
  `;
}

let profileCompletedArchiveFilter =
  "all";
let profileCompletedArchiveOpen =
  false;

function profileText(key, fallback = "") {
  return typeof window.t === "function"
    ? window.t(key, fallback)
    : fallback;
}

function getProfileSeasonMeta() {
  try {
    return JSON.parse(
      localStorage.getItem("seasonPlanMeta") || "{}"
    ) || {};
  } catch (_error) {
    return {};
  }
}

function getDefaultProfilePlannerDetails() {
  return {
    personal_note: "",
    goals: {
      target_time: "",
      targetTimeSeconds: null,
      target_pace: "",
      targetPaceSecondsPerKm: null,
      target_place_overall: "",
      target_place_age_group: "",
      target_description: ""
    },
    logistics: {
      travel_booked: false,
      accommodation_booked: false,
      registration_confirmed: false,
      bib_number: "",
      travel_note: ""
    },
    result: {
      finish_status: "",
      finish_time: "",
      finishTimeSeconds: null,
      targetTimeSeconds: null,
      finish_pace: "",
      finishPaceSecondsPerKm: null,
      goalDeltaSeconds: null,
      distanceKm: null,
      distance_source: "official",
      distance_preset: "official",
      custom_distance_km: "",
      overall_place: "",
      gender_place: "",
      age_group_place: "",
      category: "",
      official_result_url: "",
      race_report: "",
      personal_rating: ""
    }
  };
}

function normalizeProfilePlannerDetails(entry = {}) {
  const defaults =
    getDefaultProfilePlannerDetails();
  const details =
    entry && typeof entry === "object"
      ? entry
      : {};
  const legacyNote =
    String(
      entry.note ||
      entry.personal_note ||
      details.planner_details?.personal_note ||
      ""
    );
  const plannerDetails =
    details.planner_details &&
    typeof details.planner_details === "object"
      ? details.planner_details
      : {};

  return {
    ...defaults,
    ...plannerDetails,
    personal_note:
      String(
        plannerDetails.personal_note ||
        legacyNote ||
        ""
      ),
    goals: {
      ...defaults.goals,
      ...(plannerDetails.goals || {})
    },
    logistics: {
      ...defaults.logistics,
      ...(plannerDetails.logistics || {})
    },
    result: {
      ...defaults.result,
      ...(plannerDetails.result || {})
    }
  };
}

function getProfilePlannerEntry(event) {
  const meta =
    getProfileSeasonMeta();
  const key =
    getProfileFavoriteKey(event);

  return {
    ...(meta[key] || {}),
    planner_details:
      normalizeProfilePlannerDetails(
        meta[key] || {}
      )
  };
}

function hasProfileResult(details) {
  const result =
    details.result || {};

  return [
    result.finish_status,
    result.finish_time,
    result.finish_pace,
    result.overall_place,
    result.gender_place,
    result.age_group_place,
    result.category,
    result.official_result_url,
    result.race_report,
    result.personal_rating
  ].some(value => String(value || "").trim());
}

function getProfileCompletedArchiveEvents(favoriteEvents) {
  const today =
    new Date();

  today.setHours(0, 0, 0, 0);

  return favoriteEvents
    .filter(event => {
      const entry =
        getProfilePlannerEntry(event);
      const date =
        parseProfileDate(event.date);
      const resultStatus =
        String(
          entry.planner_details.result.finish_status || ""
        ).trim();

      return Boolean(
        (date && date < today) ||
        resultStatus
      );
    })
    .sort((first, second) => {
      const firstDate =
        parseProfileDate(first.date);
      const secondDate =
        parseProfileDate(second.date);

      return (
        (secondDate?.getTime() || 0) -
        (firstDate?.getTime() || 0)
      );
    });
}

function parseProfileDuration(value) {
  const text =
    String(value || "").trim();

  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) {
    return null;
  }

  const parts =
    text.split(":").map(Number);

  if (parts.some(part => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return (
    parts[0] * 3600 +
    parts[1] * 60 +
    parts[2]
  );
}

function formatProfileDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return "";
  }

  const safeSeconds =
    Math.max(0, Math.round(seconds));
  const hours =
    Math.floor(safeSeconds / 3600);
  const minutes =
    Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds =
    safeSeconds % 60;

  if (hours) {
    return [
      String(hours).padStart(2, "0"),
      String(minutes).padStart(2, "0"),
      String(remainingSeconds).padStart(2, "0")
    ].join(":");
  }

  return [
    String(minutes),
    String(remainingSeconds).padStart(2, "0")
  ].join(":");
}

function formatProfileDurationDelta(seconds) {
  const absolute =
    Math.abs(seconds);
  const hours =
    Math.floor(absolute / 3600);
  const minutes =
    Math.floor((absolute % 3600) / 60);
  const remainingSeconds =
    absolute % 60;

  if (hours) {
    return [
      hours,
      minutes,
      remainingSeconds
    ]
      .map(part => String(part).padStart(2, "0"))
      .join(":");
  }

  return [
    minutes,
    remainingSeconds
  ]
    .map(part => String(part).padStart(2, "0"))
    .join(":");
}

function parseProfileDistanceKm(value) {
  const text =
    String(value || "").trim().toLowerCase();

  if (!text) {
    return null;
  }

  if (/half\s*marathon|halbmarathon/.test(text)) {
    return 21.0975;
  }

  if (/marathon/.test(text) && !/half|halb/.test(text)) {
    return 42.195;
  }

  if (/\b70\.3\b/.test(text)) {
    return 113;
  }

  if (/ironman|langdistanz/.test(text)) {
    return 226;
  }

  const kmMatch =
    /(\d+(?:[\.,]\d+)?)\s*(?:km|kilometer|kilometre|kilometers|kilometres)\b/.exec(text);

  if (kmMatch) {
    return Number(kmMatch[1].replace(",", "."));
  }

  const mileMatch =
    /(\d+(?:[\.,]\d+)?)\s*(?:mi|mile|miles)\b/.exec(text);

  if (mileMatch) {
    return Number(mileMatch[1].replace(",", ".")) * 1.609344;
  }

  return null;
}

function formatProfilePace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return "";
  }

  const rounded =
    Math.round(secondsPerKm);
  const minutes =
    Math.floor(rounded / 60);
  const seconds =
    rounded % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function getProfileNumericSeconds(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const seconds =
    Number(value);

  return Number.isFinite(seconds) && seconds > 0
    ? seconds
    : null;
}

function getProfileNullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function getProfileResultMetrics(event, details) {
  const goals =
    details.goals || {};
  const result =
    details.result || {};
  const targetSeconds =
    getProfileNumericSeconds(goals.targetTimeSeconds) !== null
      ? getProfileNumericSeconds(goals.targetTimeSeconds)
      : getProfileNumericSeconds(result.targetTimeSeconds) !== null
        ? getProfileNumericSeconds(result.targetTimeSeconds)
        : parseProfileDuration(goals.target_time);
  const finishSeconds =
    getProfileNumericSeconds(result.finishTimeSeconds) !== null
      ? getProfileNumericSeconds(result.finishTimeSeconds)
      : parseProfileDuration(result.finish_time);
  const distanceKm =
    getProfileNullableNumber(result.distanceKm) !== null
      ? getProfileNullableNumber(result.distanceKm)
      : parseProfileDistanceKm(
        [
          result.custom_distance_km,
          event.distance,
          event.sport
        ].filter(Boolean).join(" ")
      );
  const finishPaceSecondsPerKm =
    getProfileNullableNumber(result.finishPaceSecondsPerKm) !== null
      ? getProfileNullableNumber(result.finishPaceSecondsPerKm)
      : Number.isFinite(finishSeconds) &&
        Number.isFinite(distanceKm) &&
        distanceKm > 0
        ? finishSeconds / distanceKm
        : null;
  const targetPaceSecondsPerKm =
    getProfileNullableNumber(goals.targetPaceSecondsPerKm) !== null
      ? getProfileNullableNumber(goals.targetPaceSecondsPerKm)
      : Number.isFinite(targetSeconds) &&
        Number.isFinite(distanceKm) &&
        distanceKm > 0
        ? targetSeconds / distanceKm
        : null;
  const goalDeltaSeconds =
    getProfileNullableNumber(result.goalDeltaSeconds) !== null
      ? getProfileNullableNumber(result.goalDeltaSeconds)
      : Number.isFinite(targetSeconds) &&
        Number.isFinite(finishSeconds)
        ? finishSeconds - targetSeconds
        : null;

  return {
    targetSeconds,
    finishSeconds,
    distanceKm,
    finishPaceSecondsPerKm,
    targetPaceSecondsPerKm,
    goalDeltaSeconds
  };
}

function getProfileGoalDeltaLabelFromSeconds(delta) {
  if (!Number.isFinite(delta)) {
    return "";
  }

  if (delta === 0) {
    return profileText(
      "profile.goalReached",
      "Goal reached"
    );
  }

  const formatted =
    formatProfileDurationDelta(delta);

  return delta > 0
    ? `+${formatted} ${profileText("profile.overTarget", "over target")}`
    : `-${formatted} ${profileText("profile.underTarget", "under target")}`;
}

function getProfileGoalDeltaLabel(targetTime, finishTime) {
  const targetSeconds =
    parseProfileDuration(targetTime);
  const finishSeconds =
    parseProfileDuration(finishTime);

  if (
    targetSeconds === null ||
    finishSeconds === null
  ) {
    return "";
  }

  return getProfileGoalDeltaLabelFromSeconds(
    finishSeconds - targetSeconds
  );
}

function renderProfileArchiveMetric(labelKey, fallback, value) {
  if (!String(value || "").trim()) {
    return "";
  }

  return `
    <span>
      <em>${escapeProfileHTML(profileText(labelKey, fallback))}</em>
      <strong>${escapeProfileHTML(value)}</strong>
    </span>
  `;
}

function renderProfilePrimaryResult(labelKey, fallback, value) {
  if (!String(value || "").trim()) {
    return "";
  }

  return `
    <span class="profile-completed-primary-metric">
      <em>${escapeProfileHTML(profileText(labelKey, fallback))}</em>
      <strong>${escapeProfileHTML(value)}</strong>
    </span>
  `;
}

function renderProfileRating(value) {
  const rating =
    Number(value);

  if (!Number.isFinite(rating) || rating <= 0) {
    return "";
  }

  const safeRating =
    Math.max(1, Math.min(5, Math.round(rating)));

  return `
    <span class="profile-rating-stars" aria-label="${safeRating}/5">
      ${Array.from({ length: 5 }, (_, index) => `
        <span class="${index < safeRating ? "is-active" : ""}">★</span>
      `).join("")}
    </span>
  `;
}

function renderProfilePlanningMetric(labelKey, fallback, value) {
  if (!String(value || "").trim()) {
    return "";
  }

  return `
    <span>
      <em>${escapeProfileHTML(profileText(labelKey, fallback))}</em>
      <strong>${escapeProfileHTML(value)}</strong>
    </span>
  `;
}

function getSafeProfileResultUrl(value) {
  try {
    const url =
      new URL(String(value || "").trim());

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    )
      ? url.href
      : "";
  } catch (_error) {
    return "";
  }
}

function getFilteredProfileArchiveEvents(eventsForArchive) {
  return eventsForArchive.filter(event => {
    const details =
      getProfilePlannerEntry(event).planner_details;
    const result =
      details.result || {};
    const status =
      String(result.finish_status || "").toLowerCase();
    const hasResult =
      hasProfileResult(details);

    if (profileCompletedArchiveFilter === "finisher") {
      return status === "finisher";
    }

    if (profileCompletedArchiveFilter === "dnf_dns") {
      return ["dnf", "dns", "cancelled"].includes(status);
    }

    if (profileCompletedArchiveFilter === "with_result") {
      return hasResult;
    }

    if (profileCompletedArchiveFilter === "without_result") {
      return !hasResult;
    }

    return true;
  });
}

function getProfileArchiveFilterCounts(eventsForArchive) {
  return {
    all:
      eventsForArchive.length,
    finisher:
      eventsForArchive.filter(event => {
        const status =
          String(
            getProfilePlannerEntry(event)
              .planner_details
              .result
              .finish_status || ""
          ).toLowerCase();

        return status === "finisher";
      }).length,
    dnf_dns:
      eventsForArchive.filter(event => {
        const status =
          String(
            getProfilePlannerEntry(event)
              .planner_details
              .result
              .finish_status || ""
          ).toLowerCase();

        return ["dnf", "dns", "cancelled"].includes(status);
      }).length,
    with_result:
      eventsForArchive.filter(event =>
        hasProfileResult(
          getProfilePlannerEntry(event).planner_details
        )
      ).length,
    without_result:
      eventsForArchive.filter(event =>
        !hasProfileResult(
          getProfilePlannerEntry(event).planner_details
        )
      ).length
  };
}

function renderProfileCompletedFilters(eventsForArchive) {
  const filterbar =
    document.getElementById("profileCompletedFilterbar");

  if (!filterbar) {
    return;
  }

  const counts =
    getProfileArchiveFilterCounts(eventsForArchive);

  [
    ["all", "profile.filterAll", "All"],
    ["finisher", "profile.filterFinisher", "Finisher"],
    ["dnf_dns", "profile.filterDnfDns", "DNF/DNS"],
    ["with_result", "profile.filterWithResult", "With result"],
    ["without_result", "profile.filterWithoutResult", "Without result"]
  ].forEach(([filter, key, fallback]) => {
    const button =
      filterbar.querySelector(
        `[data-profile-completed-filter="${filter}"]`
      );

    if (!button) {
      return;
    }

    button.classList.toggle(
      "active",
      profileCompletedArchiveFilter === filter
    );
    button.innerHTML = `
      <span>${escapeProfileHTML(profileText(key, fallback))}</span>
      <strong>${counts[filter] || 0}</strong>
    `;
  });
}

function updateProfileCompletedArchiveToggle() {
  const button =
    document.getElementById("profileCompletedArchiveToggle");
  const panel =
    document.getElementById("profileCompletedArchivePanel");

  if (!button || !panel) {
    return;
  }

  panel.hidden =
    !profileCompletedArchiveOpen;
  button.setAttribute(
    "aria-expanded",
    profileCompletedArchiveOpen ? "true" : "false"
  );
  button.innerHTML = `
    <span>${escapeProfileHTML(profileText(
      profileCompletedArchiveOpen
        ? "profile.hideCompletedEvents"
        : "profile.viewCompletedEvents",
      profileCompletedArchiveOpen
        ? "Hide completed events"
        : "View completed events"
    ))}</span>
    <span class="profile-completed-toggle-chevron" aria-hidden="true"></span>
  `;
}

function renderProfileCompletedArchive(favoriteEvents) {
  const list =
    document.getElementById("profileCompletedArchiveList");
  const panel =
    document.getElementById("profileCompletedArchivePanel");

  if (!list || !panel) {
    return;
  }

  const allArchiveEvents =
    getProfileCompletedArchiveEvents(favoriteEvents);

  renderProfileCompletedFilters(allArchiveEvents);
  updateProfileCompletedArchiveToggle();

  if (!profileCompletedArchiveOpen) {
    list.innerHTML =
      "";
    return;
  }

  const archiveEvents =
    getFilteredProfileArchiveEvents(
      allArchiveEvents
    );

  if (!archiveEvents.length) {
    list.innerHTML = `
      <div class="profile-completed-empty">
        <strong>${escapeProfileHTML(profileText("profile.noCompletedArchive", "No completed events yet"))}</strong>
        <span>${escapeProfileHTML(profileText("profile.noCompletedArchiveHint", "Once events from your Season Planner are over, they appear here."))}</span>
      </div>
    `;
    return;
  }

  list.innerHTML =
    archiveEvents.map(event => {
      const entry =
        getProfilePlannerEntry(event);
      const details =
        entry.planner_details;
      const goals =
        details.goals || {};
      const result =
        details.result || {};
      const hasResult =
        hasProfileResult(details);
      const metrics =
        getProfileResultMetrics(event, details);
      const finishTime =
        Number.isFinite(metrics.finishSeconds)
          ? formatProfileDuration(metrics.finishSeconds)
          : result.finish_time;
      const targetTime =
        Number.isFinite(metrics.targetSeconds)
          ? formatProfileDuration(metrics.targetSeconds)
          : goals.target_time;
      const finishPace =
        result.finish_pace ||
        formatProfilePace(metrics.finishPaceSecondsPerKm);
      const targetPace =
        goals.target_pace ||
        formatProfilePace(metrics.targetPaceSecondsPerKm);
      const deltaLabel =
        getProfileGoalDeltaLabelFromSeconds(
          metrics.goalDeltaSeconds
        );
      const note =
        details.personal_note ||
        goals.target_description ||
        result.race_report;
      const resultUrl =
        getSafeProfileResultUrl(
          result.official_result_url
        );

      return `
        <article class="profile-completed-archive-card">
          <div class="profile-completed-archive-head">
            <div>
              <span>${escapeProfileHTML(event.date || "")}</span>
              <strong>${escapeProfileHTML(event.event_name || "")}</strong>
              <em>${escapeProfileHTML([event.city, event.country].filter(Boolean).join(", "))}</em>
            </div>
            <span class="profile-completed-status ${hasResult ? "has-result" : "needs-result"}">
              ${escapeProfileHTML(result.finish_status || profileText("profile.noResultEntered", "No result entered yet"))}
            </span>
          </div>
          <div class="profile-completed-context-row">
            ${renderProfileArchiveMetric("profile.sport", "Sport", event.sport || event.sport_type)}
            ${renderProfileArchiveMetric("profile.distance", "Distance", event.distance)}
          </div>
          <div class="profile-completed-result-row">
            ${renderProfilePrimaryResult("season.finishTime", "Finish time", finishTime)}
            ${renderProfilePrimaryResult("season.finishPace", "Finish pace", finishPace)}
            ${renderProfilePrimaryResult("season.overallPlace", "Overall place", result.overall_place)}
            ${renderProfilePrimaryResult("season.ageGroupPlace", "Age-group place", result.age_group_place)}
          </div>
          <div class="profile-completed-planning-row">
            ${renderProfilePlanningMetric("season.targetTime", "Target time", targetTime)}
            ${renderProfilePlanningMetric("season.targetPace", "Target pace", targetPace)}
            ${renderProfilePlanningMetric("profile.goalDelta", "Goal delta", deltaLabel)}
            ${renderProfilePlanningMetric("profile.priority", "Priority", entry.priority || "Maybe")}
            ${result.personal_rating ? `
              <span>
                <em>${escapeProfileHTML(profileText("season.personalRating", "Personal rating"))}</em>
                ${renderProfileRating(result.personal_rating)}
              </span>
            ` : ""}
          </div>
          ${note ? `
            <p class="profile-completed-race-report">${escapeProfileHTML(note)}</p>
          ` : ""}
          ${resultUrl ? `
            <a class="profile-completed-result-link" href="${escapeProfileHTML(resultUrl)}" target="_blank" rel="noopener noreferrer">
              ${escapeProfileHTML(profileText("profile.openOfficialResult", "Open official result"))}
            </a>
          ` : ""}
        </article>
      `;
    }).join("");
}

function exportProfileData() {
  const favoriteEvents =
    getProfileFavoriteEvents();

  const exportPayload = {
    exported_at:
      new Date().toISOString(),
    email:
      document.getElementById("profileEmail")?.textContent || "",
    favorites:
      favoriteEvents.map(event => ({
        event_id:
          getProfileFavoriteKey(event),
        event_name:
          event.event_name,
        date:
          event.date,
        city:
          event.city,
        country:
          event.country,
        distance:
          event.distance
      })),
    season_meta:
      (() => {
        try {
          return JSON.parse(
            localStorage.getItem("seasonPlanMeta") || "{}"
          );
        } catch (_error) {
          return {};
        }
      })()
  };

  const blob =
    new Blob(
      [JSON.stringify(exportPayload, null, 2)],
      { type: "application/json;charset=utf-8" }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href =
    url;

  link.download =
    "sport-event-map-profile-data.json";

  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast(
    "Profile data exported",
    "Your local favorites and season metadata were downloaded."
  );
}


async function openProfileModal() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {

    showAppMessage(
      "Login required",
      "Please log in before opening your profile."
    );

    return;

  }

  const role =
    await getCurrentUserRole(user);

  currentUserRole =
    role;

  document.getElementById("profileEmail").innerText =
    user.email || "-";

  const profileRole =
    document.getElementById("profileRole");

  if (profileRole) {
    profileRole.innerText =
      role;
  }

  const securityStatus =
    document.getElementById("profileSecurityStatus");

  if (securityStatus) {

    securityStatus.innerText =
      window.t
        ? window.t("profile.password")
        : "Password";

  }

  const accountStatus =
    document.getElementById("profileAccountStatus");

  if (accountStatus) {

    accountStatus.innerText =
      user.email_confirmed_at
        ? window.t
          ? window.t("profile.verified")
          : "Verified"
        : window.t
          ? window.t("profile.active")
          : "Active";

  }

  const plannerStatus =
    document.getElementById("profilePlannerStatus");

  if (plannerStatus) {

    plannerStatus.innerText =
      window.t
        ? window.t("profile.protected")
        : "Protected";

  }

  const languageSelect =
    document.getElementById("profileLanguageSelect");

  if (languageSelect && typeof getAppLanguage === "function") {

    languageSelect.value =
      getAppLanguage();

  }

  renderProfileCompletedEvents(
    getProfileFavoriteEvents()
  );

  profileModal.classList.add("open");

}


function closeProfileModal() {

  profileModal.classList.remove("open");

}


async function updateProfilePassword() {

  const newPassword =
    document
      .getElementById("profileNewPassword")
      .value;

  const repeatPassword =
    document
      .getElementById("profileRepeatPassword")
      .value;

  if (newPassword.length < 8) {

    showAppMessage(
      "Password too short",
      "Please use at least 8 characters."
    );

    return;

  }

  if (newPassword !== repeatPassword) {

    showAppMessage(
      "Passwords do not match",
      "Please repeat the same password."
    );

    return;

  }

  const button =
    document.getElementById("profilePasswordBtn");

  setButtonLoading(
    button,
    true,
    "Updating..."
  );

  const { error } =
    await supabaseClient.auth.updateUser({
      password: newPassword
    });

  if (error) {

    showAppMessage(
      "Password update failed",
      getFriendlyErrorMessage(
        error,
        "Your password could not be updated. Please sign in again and retry."
      )
    );

    setButtonLoading(button, false);
    return;

  }

  document.getElementById("profileNewPassword").value = "";
  document.getElementById("profileRepeatPassword").value = "";

  showAppMessage(
    "Password updated",
    "Your password has been changed successfully."
  );

  setButtonLoading(button, false);
}

async function updateProfileEmail() {
  const emailInput =
    document.getElementById("profileNewEmail");

  const newEmail =
    emailInput?.value.trim() || "";

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    showAppMessage(
      "Email required",
      "Please enter a valid email address."
    );

    return;
  }

  const button =
    document.getElementById("profileEmailBtn");

  setButtonLoading(
    button,
    true,
    "Sending..."
  );

  const { error } =
    await supabaseClient.auth.updateUser({
      email: newEmail
    });

  if (error) {
    showAppMessage(
      "Email update failed",
      getFriendlyErrorMessage(
        error,
        "Your email address could not be changed. Please try again."
      )
    );

    setButtonLoading(button, false);
    return;
  }

  emailInput.value = "";

  showAppMessage(
    "Confirm your new email",
    "We sent a confirmation link to your new email address. The change is completed after confirmation."
  );

  setButtonLoading(button, false);
}

async function sendProfilePasswordReset() {
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  const email =
    user?.email || "";

  if (!email) {
    showAppMessage(
      "Email unavailable",
      "Please sign in again before requesting a password reset."
    );

    return;
  }

  const button =
    document.getElementById("profilePasswordResetBtn");

  setButtonLoading(
    button,
    true,
    "Sending..."
  );

  const { error } =
    await supabaseClient.auth.resetPasswordForEmail(
      email,
      {
        redirectTo:
          getAuthRedirectUrl("password-reset")
      }
    );

  if (error) {
    showAppMessage(
      "Reset failed",
      getFriendlyErrorMessage(
        error,
        "We could not send the password reset email. Please try again."
      )
    );

    setButtonLoading(button, false);
    return;
  }

  showAppMessage(
    "Password email sent",
    "We sent you an email to change your password."
  );

  trackEvent("password_reset_started", {
    page: "profile"
  });

  setButtonLoading(button, false);
}

async function getCurrentUserRole(user) {

  if (!user) {

    return "guest";

  }

  const {
    data,
    error
  } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .limit(1);

  if (error) {

    console.warn(
      "Could not load user role. Admin UI stays hidden until profiles/RLS are configured.",
      error
    );

    return "user";

  }

  return (
    data &&
    data[0] &&
    data[0].role
  )
    ? data[0].role
    : "user";

}

async function ensureUserProfile(user) {

  if (!user) {

    return;

  }

  const {
    error
  } = await supabaseClient
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
        role: "user"
      },
      {
        onConflict: "id",
        ignoreDuplicates: true
      }
    );

  if (error) {

    console.warn(
      "Could not ensure user profile. The database trigger/RLS may already handle this.",
      error
    );

  }

}


async function isCurrentUserAdmin() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  const role =
    await getCurrentUserRole(user);

  currentUserRole =
    role;

  return role === "admin";

}

async function loadRemotePlanningState(user) {
  if (!user) {
    return;
  }

  try {
    const favoritesPromise =
      supabaseClient
        .from("favorites")
        .select("event_id")
        .eq("user_id", user.id);
    let seasonPromise =
      supabaseClient
        .from("season_planner_events")
        .select("event_id, priority, planned_distance, planner_details")
        .eq("user_id", user.id);

    let [
      favoritesResult,
      seasonResult
    ] = await Promise.all([
      favoritesPromise,
      seasonPromise
    ]);

    if (
      seasonResult.error &&
      /planner_details/i.test(
        seasonResult.error.message || ""
      )
    ) {
      seasonResult =
        await supabaseClient
          .from("season_planner_events")
          .select("event_id, priority, planned_distance")
          .eq("user_id", user.id);
    }

    if (
      favoritesResult.error ||
      seasonResult.error
    ) {
      console.warn(
        "Cloud planning data unavailable; keeping local data.",
        favoritesResult.error?.message ||
        seasonResult.error?.message
      );
      return;
    }

    const remoteFavorites =
      (favoritesResult.data || [])
        .map(row => row.event_id)
        .filter(Boolean);

    const remoteSeasonMeta =
      (seasonResult.data || [])
        .reduce((result, row) => {
          result[row.event_id] = {
            priority:
              row.priority || "Maybe",
            distance:
              row.planned_distance || "",
            planner_details:
              row.planner_details || {}
          };
          return result;
        }, {});

    const planningState = {
      favorites: remoteFavorites,
      seasonMeta: remoteSeasonMeta
    };

    if (
      typeof window.applyRemotePlanningState === "function"
    ) {
      window.applyRemotePlanningState(
        planningState
      );
    } else {
      window.__pendingPlanningState =
        planningState;
    }
  } catch (error) {
    console.warn(
      "Could not load cloud planning data:",
      error
    );
  }
}

async function syncFavoriteToSupabase(event, isFavoriteNow) {
  try {
    const {
      data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return;
    }

    const eventId =
      typeof getEventKey === "function"
        ? getEventKey(event)
        : String(event?.event_key || "");

    if (!eventId) {
      return;
    }

    if (isFavoriteNow) {
      const [
        favoriteResult,
        seasonResult
      ] = await Promise.all([
        supabaseClient
          .from("favorites")
          .upsert(
            {
              user_id: user.id,
              event_id: eventId
            },
            {
              onConflict: "user_id,event_id",
              ignoreDuplicates: true
            }
          ),
        supabaseClient
          .from("season_planner_events")
          .upsert(
            {
              user_id: user.id,
              event_id: eventId
            },
            {
              onConflict: "user_id,event_id",
              ignoreDuplicates: true
            }
          )
      ]);

      if (
        favoriteResult.error ||
        seasonResult.error
      ) {
        throw (
          favoriteResult.error ||
          seasonResult.error
        );
      }
      return;
    }

    const [
      favoriteResult,
      seasonResult
    ] = await Promise.all([
      supabaseClient
        .from("favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", eventId),
      supabaseClient
        .from("season_planner_events")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", eventId)
    ]);

    if (
      favoriteResult.error ||
      seasonResult.error
    ) {
      throw (
        favoriteResult.error ||
        seasonResult.error
      );
    }
  } catch (error) {
    console.warn(
      "Favorite cloud sync failed:",
      error
    );
    showAppMessage(
      "Sync delayed",
      "The change is saved on this device, but cloud sync is currently unavailable."
    );
  }
}

async function syncSeasonPlanMetaToSupabase(eventId, patch = {}) {
  try {
    const {
      data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user || !eventId) {
      return;
    }

    const payload = {
      user_id: user.id,
      event_id: eventId
    };

    if (patch.priority) {
      payload.priority =
        patch.priority;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        "distance"
      )
    ) {
      payload.planned_distance =
        patch.distance || null;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        patch,
        "planner_details"
      )
    ) {
      payload.planner_details =
        patch.planner_details || {};
    }

    let { error } =
      await supabaseClient
        .from("season_planner_events")
        .upsert(
          payload,
          {
            onConflict: "user_id,event_id"
          }
        );

    if (
      error &&
      payload.planner_details &&
      /planner_details/i.test(error.message || "")
    ) {
      const fallbackPayload =
        { ...payload };

      delete fallbackPayload.planner_details;

      ({ error } =
        await supabaseClient
          .from("season_planner_events")
          .upsert(
            fallbackPayload,
            {
              onConflict: "user_id,event_id"
            }
          ));
    }

    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn(
      "Season Planner cloud sync failed:",
      error
    );
  }
}

window.syncFavoriteToSupabase =
  syncFavoriteToSupabase;

window.syncSeasonPlanMetaToSupabase =
  syncSeasonPlanMetaToSupabase;


async function updateAuthUI() {

  const {

    data: { session }

  } = await supabaseClient.auth.getSession();


  const loginBtn =
    document.getElementById("loginBtn");

  const registerBtn =
    document.getElementById("registerBtn");

  const logoutBtn =
    document.getElementById("logoutBtn");

  if (session) {

    await ensureUserProfile(
      session.user
    );

    const isAdmin =
      await isCurrentUserAdmin();

    loginBtn.style.display = "none";

    registerBtn.style.display = "none";

    logoutBtn.style.display = "none";

    profileBtn.style.display = "block";

    addEventBtn.style.display = "block";

    adminBtn.style.display =
      isAdmin
        ? "block"
        : "none";

    document
      .querySelectorAll("[data-admin-nav]")
      .forEach(link => {
        link.style.display =
          isAdmin
            ? ""
            : "none";
      });

    await loadRemotePlanningState(
      session.user
    );

    if (
      typeof window.processPendingSeasonAdd === "function"
    ) {
      await window.processPendingSeasonAdd();
    }

  }

  else {

    currentUserRole = "guest";

    loginBtn.style.display = "block";

    registerBtn.style.display = "block";

    logoutBtn.style.display = "none";

    profileBtn.style.display = "none";

    addEventBtn.style.display = "none";

    adminBtn.style.display = "none";

    document
      .querySelectorAll("[data-admin-nav]")
      .forEach(link => {
        link.style.display = "none";
      });

  }

}

document
  .getElementById("logoutBtn")
  ?.addEventListener("click", logout);

document
  .getElementById("profileLogoutBtn")
  ?.addEventListener("click", async () => {
    closeProfileModal();
    await logout();
  });

document
  .getElementById("profileExportDataBtn")
  ?.addEventListener("click", exportProfileData);

document
  .getElementById("profileCompletedArchiveToggle")
  ?.addEventListener("click", () => {
    profileCompletedArchiveOpen =
      !profileCompletedArchiveOpen;

    renderProfileCompletedArchive(
      getProfileFavoriteEvents()
    );
  });

document
  .getElementById("profileCompletedFilterbar")
  ?.addEventListener("click", event => {
    const button =
      event.target.closest("[data-profile-completed-filter]");

    if (!button) {
      return;
    }

    profileCompletedArchiveFilter =
      button.dataset.profileCompletedFilter || "all";

    document
      .querySelectorAll("[data-profile-completed-filter]")
      .forEach(filterButton => {
        filterButton.classList.toggle(
          "active",
          filterButton === button
        );
      });

    renderProfileCompletedArchive(
      getProfileFavoriteEvents()
    );
  });

document.addEventListener(
  "app-language-changed",
  () => {
    updateProfileCompletedArchiveToggle();
    renderProfileCompletedArchive(
      getProfileFavoriteEvents()
    );
  }
);

profileBtn
  .addEventListener("click", openProfileModal);

if (feedbackBtn) {
  feedbackBtn.addEventListener(
    "click",
    openFeedbackModal
  );
}

if (betaFeedbackBtn) {
  betaFeedbackBtn.addEventListener(
    "click",
    openFeedbackModal
  );
}

document
  .querySelectorAll("[data-feedback-rating]")
  .forEach(button => {
    button.addEventListener("click", () => {
      const ratingElement =
        document.getElementById("feedbackRating");

      if (ratingElement) {
        ratingElement.value =
          button.dataset.feedbackRating || "";
      }

      document
        .querySelectorAll("[data-feedback-rating]")
        .forEach(item =>
          item.classList.toggle(
            "active",
            item === button
          )
        );
    });
  });

document
  .getElementById("closeFeedbackModal")
  ?.addEventListener("click", () => {
    feedbackModal?.classList.remove("open");
  });

document
  .getElementById("submitFeedbackBtn")
  ?.addEventListener("click", submitUserFeedback);

document
  .getElementById("closeProfileModal")
  .addEventListener("click", closeProfileModal);

document
  .getElementById("profilePasswordBtn")
  .addEventListener("click", updateProfilePassword);

document
  .getElementById("profileEmailBtn")
  ?.addEventListener("click", updateProfileEmail);

document
  .getElementById("profileEmailForm")
  ?.addEventListener("submit", event => {
    event.preventDefault();
    updateProfileEmail();
  });

document
  .getElementById("profilePasswordResetBtn")
  ?.addEventListener("click", sendProfilePasswordReset);

const profileLanguageSelect =
  document.getElementById("profileLanguageSelect");

if (profileLanguageSelect) {

  profileLanguageSelect.addEventListener("change", async () => {

    if (typeof setAppLanguage === "function") {

      setAppLanguage(profileLanguageSelect.value);

    }

    const {
      data: { user }
    } = await supabaseClient.auth.getUser();

    if (user) {
      const { error } =
        await supabaseClient
          .from("profiles")
          .update({
            preferred_language:
              profileLanguageSelect.value
          })
          .eq("id", user.id);

      if (error) {
        console.warn(
          "Profile language cloud sync failed:",
          error.message
        );
      }
    }

    openProfileModal();

  });

}


function clearAuthCallbackParameters() {
  const url =
    new URL(window.location.href);

  [
    "auth_action",
    "error",
    "error_code",
    "error_description",
    "code"
  ].forEach(name =>
    url.searchParams.delete(name)
  );

  if (window.history?.replaceState) {
    const safeHash =
      /access_token|refresh_token|type=/i.test(url.hash)
        ? ""
        : url.hash;

    window.history.replaceState(
      {},
      document.title,
      `${url.pathname}${url.search}${safeHash}`
    );
  }
}

async function handleAuthCallbackState(event) {
  const url =
    new URL(window.location.href);

  const action =
    url.searchParams.get("auth_action");

  const callbackError =
    url.searchParams.get("error_description");

  if (callbackError) {
    console.warn(
      "Supabase auth callback failed:",
      callbackError
    );
    showAppMessage(
      "Authentication link expired",
      "This authentication link is invalid or expired. Request a new email and try again."
    );
    clearAuthCallbackParameters();
    return;
  }

  if (
    event === "PASSWORD_RECOVERY" ||
    action === "password-reset"
  ) {
    showAppMessage(
      "Choose a new password",
      "Open Profile settings and enter your new password."
    );

    window.setTimeout(
      openProfileModal,
      150
    );
    clearAuthCallbackParameters();
    return;
  }

  if (
    action === "email-confirmation" &&
    (
      event === "SIGNED_IN" ||
      event === "INITIAL_SESSION"
    )
  ) {
    showAppMessage(
      "Email confirmed",
      "Your account is confirmed and ready to use."
    );
    clearAuthCallbackParameters();
  }
}

updateAuthUI()
  .catch(error => {
    console.error(
      "Initial authentication state failed:",
      error
    );
  });

supabaseClient.auth.onAuthStateChange((event) => {
  analyticsUserPromise = null;

  window.setTimeout(async () => {
    try {
      await updateAuthUI();
      await handleAuthCallbackState(event);

      if (
        event === "SIGNED_OUT" &&
        typeof window.applyRemotePlanningState === "function"
      ) {
        window.applyRemotePlanningState({
          favorites: [],
          seasonMeta: {}
        });
      }
    } catch (error) {
      console.error(
        "Authentication state update failed:",
        error
      );
    }
  }, 0);
});

const eventModal =
  document.getElementById("eventModal");


document
  .getElementById("closeEventModal")
  .addEventListener("click", () => {

    eventModal.classList.remove("open");

  });


if (addEventBtn) {

  addEventBtn.onclick = () => {

    eventModalOpenedAt =
      Date.now();

    clearEventSubmitStatus();

    eventModal.classList.add("open");

  };

}

async function submitEvent() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) {

    showEventSubmitError(
      "Login required",
      "Please log in before submitting an event."
    );

    return;

  }

  const honeypot =
    document
      .getElementById("eventWebsiteInput")
      .value
      .trim();

  if (honeypot) {

    console.warn(
      "Blocked likely bot event submission."
    );

    return;

  }

  if (
    eventModalOpenedAt &&
    Date.now() - eventModalOpenedAt < EVENT_MODAL_MIN_OPEN_MS
  ) {

    showEventSubmitError(
      "Please wait",
      "Please review the event details before submitting."
    );

    return;

  }

  const lastSubmitAt =
    Number(
      localStorage.getItem(EVENT_LAST_SUBMIT_KEY) || 0
    );

  if (
    lastSubmitAt &&
    Date.now() - lastSubmitAt < EVENT_SUBMIT_COOLDOWN_MS
  ) {

    showEventSubmitError(
      "Slow down",
      "Please wait a moment before submitting another event."
    );

    return;

  }

  const address =
    document
      .getElementById("eventAddressInput")
      .value
      .trim();

  const city =
    document
      .getElementById("eventCityInput")
      .value
      .trim();

  const country =
    document
      .getElementById("eventCountryInput")
      .value
      .trim();

  const eventName =
    document
      .getElementById("eventNameInput")
      .value
      .trim();

  const sport =
    document
      .getElementById("eventSportInput")
      .value
      .trim();

  const date =
    document
      .getElementById("eventDateInput")
      .value
      .trim();

  const distance =
    document
      .getElementById("eventDistanceInput")
      .value
      .trim();

  const eventUrl =
    document
      .getElementById("eventUrlInput")
      .value
      .trim();

  const participants =
    document
      .getElementById("eventParticipantsInput")
      .value
      .trim();

  const courseType =
    document
      .getElementById("eventCourseTypeInput")
      .value
      .trim();

  const elevation =
    document
      .getElementById("eventElevationInput")
      .value
      .trim();

  const highlight =
    document
      .getElementById("eventHighlightInput")
      .value
      .trim();

  document
    .querySelectorAll(".event-field-invalid")
    .forEach(element => {
      element.classList.remove("event-field-invalid");
    });

  const requiredFields = [
    [eventName, "Event Name", "eventNameInput"],
    [sport, "Sport", "eventSportInput"],
    [date, "Date", "eventDateInput"],
    [city, "City", "eventCityInput"],
    [country, "Country", "eventCountryInput"],
    [distance, "Distance", "eventDistanceInput"],
    [eventUrl, "Event URL", "eventUrlInput"]
  ];

  const missingFields =
    requiredFields
      .filter(([value]) => !value)
      .map(([, label, id]) => {
        document
          .getElementById(id)
          ?.classList.add("event-field-invalid");

        return label;
      });

  if (missingFields.length) {

    showEventSubmitError(
      "Required fields missing",
      `Bitte fülle alle Pflichtfelder korrekt aus: ${missingFields.join(", ")}.`
    );

    return;

  }

  if (!isGermanDateString(date)) {
    document
      .getElementById("eventDateInput")
      ?.classList.add("event-field-invalid");

    showEventSubmitError(
      "Invalid date",
      "Bitte gib das Datum im Format DD.MM.YYYY ein."
    );

    return;

  }

  if (!city || !country) {
    document
      .getElementById(city ? "eventCountryInput" : "eventCityInput")
      ?.classList.add("event-field-invalid");

    showEventSubmitError(
      "Missing location",
      "Bitte gib mindestens Stadt und Land an, damit die Koordinaten gefunden werden können."
    );

    return;

  }

  let parsedEventUrl;

  try {
    parsedEventUrl =
      new URL(eventUrl);
  } catch (_error) {
    parsedEventUrl = null;
  }

  if (
    !parsedEventUrl ||
    !["http:", "https:"].includes(
      parsedEventUrl.protocol
    )
  ) {
    document
      .getElementById("eventUrlInput")
      ?.classList.add("event-field-invalid");

    showEventSubmitError(
      "Invalid website",
      "Bitte gib eine vollständige offizielle Website ein, beginnend mit https:// oder http://."
    );
    return;
  }

  const submitButton =
    document.getElementById("submitEventBtn");

  setButtonLoading(
    submitButton,
    true,
    "Submitting..."
  );

  // GEOCODING
  const coordinates =
    await geocodeEventLocation(
      address,
      city,
      country
    );

  if (!coordinates) {
    [
      "eventAddressInput",
      "eventCityInput",
      "eventCountryInput"
    ].forEach(id => {
      document
        .getElementById(id)
        ?.classList.add("event-field-invalid");
    });

    showEventSubmitError(
      "Location not found",
      "Die Adresse konnte nicht verarbeitet werden. Bitte prüfe Adresse, Stadt und Land."
    );

    setButtonLoading(submitButton, false);
    return;

  }


  const latitude =
    coordinates.latitude;

  const longitude =
    coordinates.longitude;

  const descriptionLines = [];

  if (participants) {
    descriptionLines.push(
      `Participants: ${participants}`
    );
  }

  if (courseType) {
    descriptionLines.push(
      elevation
        ? `Course: ${courseType} (${elevation} m elevation gain)`
        : `Course: ${courseType}`
    );
  }

  else if (elevation) {
    descriptionLines.push(
      `Course: ${elevation} m elevation gain`
    );
  }

  if (highlight) {
    descriptionLines.push(
      `Highlight: ${highlight}`
    );
  }

  // SAVE TO SUPABASE
  const insertPayload = {

    event_name:
      eventName,

    sport:
      normalizeSubmittedSport(sport),

    date:
      date,

    city: city,

    country: country,

    address:
      address,

    latitude: latitude,

    longitude: longitude,

    distance:
      distance,

    event_url:
      eventUrl,

    description:
      descriptionLines.join("\n"),

    status: "pending",

    created_by:
      user.id

  };

  console.log("Submitting event payload:", {
    userId: user.id,
    status: insertPayload.status,
    created_by: insertPayload.created_by,
    event_name: insertPayload.event_name
  });

  const { error } =
    await supabaseClient
      .from("events")
      .insert([insertPayload]);


  if (error) {

    console.error("Event submission failed:", {
      error,
      userId: user.id,
      insertPayload
    });

    const isPolicyError =
      error.message &&
      error.message
        .toLowerCase()
        .includes("row-level security");

    showAppMessage(
      "Event submission failed",
      isPolicyError
        ? "Your account is not allowed to submit this event. Please sign in again and retry."
        : getFriendlyErrorMessage(
            error,
            "The event could not be saved. Please try again."
          )
    );

    setButtonLoading(submitButton, false);
    return;

  }

  [
    "eventNameInput",
    "eventSportInput",
    "eventDateInput",
    "eventAddressInput",
    "eventCityInput",
    "eventCountryInput",
    "eventDistanceInput",
    "eventUrlInput",
    "eventParticipantsInput",
    "eventCourseTypeInput",
    "eventElevationInput",
    "eventHighlightInput"
  ].forEach(id => {

    document.getElementById(id).value = "";

  });

  showAppMessage(
    "Event submitted",
    "Your event is waiting for admin approval."
  );

  if (typeof trackEvent === "function") {
    trackEvent("event_submitted", {
      sport: normalizeSubmittedSport(sport),
      country
    });
  }

  updateEventSubmitPreview();

  localStorage.setItem(
    EVENT_LAST_SUBMIT_KEY,
    String(Date.now())
  );

  eventModal.classList.remove("open");

  setButtonLoading(submitButton, false);

}


function isGermanDateString(value) {

  const match =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

  if (!match) {

    return false;

  }

  const day =
    Number(match[1]);

  const month =
    Number(match[2]);

  const year =
    Number(match[3]);

  const parsedDate =
    new Date(year, month - 1, day);

  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  );

}


function normalizeSubmittedSport(value) {

  const sport =
    String(value || "")
      .trim()
      .toLowerCase();

  if (sport.includes("triathlon")) {

    return "Triathlon";

  }

  if (
    sport.includes("ultra") ||
    sport.includes("trail")
  ) {

    return "Ultramarathon";

  }

  return "Running";

}


async function geocodeEventLocation(
  address,
  city,
  country
) {

  const queries = [
    [
      address,
      city,
      country
    ],
    [
      city,
      country
    ]
  ]
    .map(parts =>
      parts
        .filter(Boolean)
        .join(", ")
    )
    .filter(Boolean);

  for (const query of queries) {

    const geoResponse =
      await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      );

    if (!geoResponse.ok) {

      continue;

    }

    const geoData =
      await geoResponse.json();

    if (!geoData.length) {

      continue;

    }

    const latitude =
      Number(geoData[0].lat);

    const longitude =
      Number(geoData[0].lon);

    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {

      return {
        latitude,
        longitude
      };

    }

  }

  return null;

}


document
  .getElementById("submitEventBtn")
  .addEventListener("click", submitEvent);


function updateEventSubmitPreview() {
  const preview =
    document.getElementById("eventSubmitPreview");

  if (!preview) {
    return;
  }

  const name =
    document.getElementById("eventNameInput").value.trim() ||
    (
      typeof window.t === "function"
        ? window.t("event.name", "Event name")
        : "Event name"
    );

  const sport =
    document.getElementById("eventSportInput").value.trim() ||
    (
      typeof window.t === "function"
        ? window.t("event.sport", "Sport")
        : "Sport"
    );

  const date =
    document.getElementById("eventDateInput").value.trim() ||
    (
      typeof window.t === "function"
        ? window.t("event.date", "Date")
        : "Date"
    );

  const city =
    document.getElementById("eventCityInput").value.trim() ||
    (
      typeof window.t === "function"
        ? window.t("event.city", "City")
        : "City"
    );

  const participants =
    document.getElementById("eventParticipantsInput").value.trim();

  const course =
    document.getElementById("eventCourseTypeInput").value.trim();

  const elevation =
    document.getElementById("eventElevationInput").value.trim();

  const highlight =
    document.getElementById("eventHighlightInput").value.trim();

  const stats = [
    participants
      ? `${typeof window.t === "function" ? window.t("event.participants", "Participants") : "Participants"}: ${participants}`
      : "",
    course
      ? `${typeof window.t === "function" ? window.t("event.courseProfile", "Course") : "Course"}: ${course}${elevation ? ` (${elevation} m)` : ""}`
      : elevation
        ? `${typeof window.t === "function" ? window.t("event.elevation", "Elevation gain") : "Elevation gain"}: ${elevation} m`
        : "",
    highlight
      ? `${typeof window.t === "function" ? window.t("event.highlight", "Highlight") : "Highlight"}: ${highlight}`
      : ""
  ].filter(Boolean);

  preview.innerHTML = `
    <strong>${escapeAdminHTML(name)}</strong>
    <span>${escapeAdminHTML(sport)} · ${escapeAdminHTML(date)} · ${escapeAdminHTML(city)}</span>
    ${
      stats.length
        ? `<ul>${stats.map(item => `<li>${escapeAdminHTML(item)}</li>`).join("")}</ul>`
        : `<span>${escapeAdminHTML(
            typeof window.t === "function"
              ? window.t("event.previewHint", "Fill in the event details to preview the submission.")
              : "Fill in the event details to preview the submission."
          )}</span>`
    }
  `;
}


[
  "eventNameInput",
  "eventSportInput",
  "eventDateInput",
  "eventCityInput",
  "eventParticipantsInput",
  "eventCourseTypeInput",
  "eventElevationInput",
  "eventHighlightInput"
].forEach(id => {
  const input =
    document.getElementById(id);

  if (input) {
    input.addEventListener(
      "input",
      () => {
        clearEventSubmitStatus();
        updateEventSubmitPreview();
      }
    );

    input.addEventListener(
      "change",
      () => {
        clearEventSubmitStatus();
        updateEventSubmitPreview();
      }
    );
  }
});

const adminModal =
  document.getElementById("adminModal");

const wtStartDate =
  document.getElementById("wtStartDate");

const wtEndDate =
  document.getElementById("wtEndDate");

const previewWorldTriathlonBtn =
  document.getElementById("previewWorldTriathlonBtn");

const saveWorldTriathlonBtn =
  document.getElementById("saveWorldTriathlonBtn");

const worldTriathlonImportStatus =
  document.getElementById("worldTriathlonImportStatus");

const worldTriathlonPreviewList =
  document.getElementById("worldTriathlonPreviewList");

const pendingCount =
  document.getElementById("pendingCount");

const approvedCount =
  document.getElementById("approvedCount");

const rejectedCount =
  document.getElementById("rejectedCount");

const missingCoordsCount =
  document.getElementById("missingCoordsCount");

const missingStatsCount =
  document.getElementById("missingStatsCount");

const urlReviewCount =
  document.getElementById("urlReviewCount");

const approvedLast30Count =
  document.getElementById("approvedLast30Count");

const rejectedLast30Count =
  document.getElementById("rejectedLast30Count");

const statusReviewList =
  document.getElementById("statusReviewList");

const dateReviewList =
  document.getElementById("dateReviewList");

const coordinateReviewList =
  document.getElementById("coordinateReviewList");

const officialWebsiteReviewList =
  document.getElementById("officialWebsiteReviewList");

const qualityPriorityReviewList =
  document.getElementById("qualityPriorityReviewList");

const qualityReviewSort =
  document.getElementById("qualityReviewSort");

const qualityBulkSelectionCount =
  document.getElementById("qualityBulkSelectionCount");

const qualityBulkAction =
  document.getElementById("qualityBulkAction");

const applyQualityBulkActionBtn =
  document.getElementById("applyQualityBulkActionBtn");

const qualityReviewCount =
  document.getElementById("qualityReviewCount");

const activeApprovedEventsCount =
  document.getElementById("activeApprovedEventsCount");

const eventGoalProgressCount =
  document.getElementById("eventGoalProgressCount");

const eventGoalProgressLabel =
  document.getElementById("eventGoalProgressLabel");

const eventGoalProgressBar =
  document.getElementById("eventGoalProgressBar");

const possibleDuplicateCount =
  document.getElementById("possibleDuplicateCount");

const missingQualityCoordsCount =
  document.getElementById("missingQualityCoordsCount");

const averageQualityScore =
  document.getElementById("averageQualityScore");

const qualitySportBreakdown =
  document.getElementById("qualitySportBreakdown");

const qualityCountryBreakdown =
  document.getElementById("qualityCountryBreakdown");

const adminPendingTabCount =
  document.getElementById("adminPendingTabCount");

const adminQualityTabCount =
  document.getElementById("adminQualityTabCount");

const adminFeedbackTabCount =
  document.getElementById("adminFeedbackTabCount");

const adminKnowledgeTabCount =
  document.getElementById("adminKnowledgeTabCount");

const adminKnowledgeAuditTabCount =
  document.getElementById("adminKnowledgeAuditTabCount");

const adminSystemStatus =
  document.getElementById("adminSystemStatus");

const adminLastUpdated =
  document.getElementById("adminLastUpdated");

const refreshAdminDashboardBtn =
  document.getElementById("refreshAdminDashboardBtn");

const refreshPendingEventsBtn =
  document.getElementById("refreshPendingEventsBtn");

const refreshDataQualityBtn =
  document.getElementById("refreshDataQualityBtn");

const pendingEventsSummary =
  document.getElementById("pendingEventsSummary");

const pendingEventSearch =
  document.getElementById("pendingEventSearch");

const pendingEventFilter =
  document.getElementById("pendingEventFilter");

const pendingBatchFilter =
  document.getElementById("pendingBatchFilter");

const pendingEventSort =
  document.getElementById("pendingEventSort");

const pendingBulkSelectionCount =
  document.getElementById("pendingBulkSelectionCount");

const approveSelectedPendingBtn =
  document.getElementById("approveSelectedPendingBtn");

const approveVisibleReadyBtn =
  document.getElementById("approveVisibleReadyBtn");

const adminStagingCsvInput =
  document.getElementById("adminStagingCsvInput");

const previewStagingCsvBtn =
  document.getElementById("previewStagingCsvBtn");

const saveStagingCsvBtn =
  document.getElementById("saveStagingCsvBtn");

const adminStagingImportStatus =
  document.getElementById("adminStagingImportStatus");

const adminStagingPreviewList =
  document.getElementById("adminStagingPreviewList");

const knowledgeElements = {
  eventSelect: document.getElementById("knowledgeEventSelect"),
  slug: document.getElementById("knowledgeEventSlug"),
  verificationStatus: document.getElementById("knowledgeVerificationStatus"),
  isPublic: document.getElementById("knowledgeIsPublic"),
  form: document.getElementById("eventKnowledgeForm"),
  status: document.getElementById("eventKnowledgeStatus"),
  refresh: document.getElementById("refreshEventKnowledgeBtn"),
  load: document.getElementById("loadEventKnowledgeBtn"),
  save: document.getElementById("saveEventKnowledgeBtn"),
  sources: document.getElementById("knowledgeSourcesList"),
  addSource: document.getElementById("addKnowledgeSourceBtn"),
  faq: document.getElementById("knowledgeFaqList"),
  addFaq: document.getElementById("addKnowledgeFaqBtn")
};

const knowledgeResearchElements = {
  panel: document.querySelector(".admin-knowledge-research-panel"),
  scope: document.getElementById("knowledgeResearchScope"),
  limit: document.getElementById("knowledgeResearchLimit"),
  start: document.getElementById("startKnowledgeResearchBtn"),
  command: document.getElementById("knowledgeResearchCommand"),
  status: document.getElementById("knowledgeResearchStatus"),
  jobStatus: document.getElementById("knowledgeResearchJobStatus"),
  currentEvent: document.getElementById("knowledgeResearchCurrentEvent"),
  processed: document.getElementById("knowledgeResearchProcessed"),
  foundFields: document.getElementById("knowledgeResearchFoundFields"),
  errors: document.getElementById("knowledgeResearchErrorCount")
};

const knowledgeAuditElements = {
  status: document.getElementById("knowledgeAuditStatus"),
  refresh: document.getElementById("refreshKnowledgeAuditBtn"),
  list: document.getElementById("knowledgeAuditList"),
  priority: document.getElementById("knowledgeAuditPriorityFilter"),
  search: document.getElementById("knowledgeAuditSearch"),
  total: document.getElementById("knowledgeAuditTotalCount"),
  average: document.getElementById("knowledgeAuditAverageScore"),
  high: document.getElementById("knowledgeAuditHighCount"),
  review: document.getElementById("knowledgeAuditReviewCount")
};

const analyticsElements = {
  range: document.getElementById("adminAnalyticsRange"),
  rangeLabel: document.getElementById("analyticsRangeLabel"),
  refresh: document.getElementById("refreshAdminAnalyticsBtn"),
  totalAccounts: document.getElementById("analyticsTotalAccounts"),
  activeUsers7d: document.getElementById("analyticsActiveUsers7d"),
  activeUsers30d: document.getElementById("analyticsActiveUsers30d"),
  returningUsers7d: document.getElementById("analyticsReturningUsers7d"),
  returningUsers30d: document.getElementById("analyticsReturningUsers30d"),
  totalSessions: document.getElementById("analyticsTotalSessions"),
  searchesKpi: document.getElementById("analyticsSearchesKpi"),
  favoritesAddedKpi: document.getElementById("analyticsFavoritesAddedKpi"),
  plannerUsersKpi: document.getElementById("analyticsPlannerUsersKpi"),
  plannerEventsAddedKpi: document.getElementById("analyticsPlannerEventsAddedKpi"),
  feedbackSubmissionsKpi: document.getElementById("analyticsFeedbackSubmissionsKpi"),
  retentionInsight: document.getElementById("analyticsRetentionInsight"),
  discoveryInsight: document.getElementById("analyticsDiscoveryInsight"),
  planningInsight: document.getElementById("analyticsPlanningInsight"),
  newReturningSplit: document.getElementById("analyticsNewReturningSplit"),
  avgSessionsPerUser: document.getElementById("analyticsAvgSessionsPerUser"),
  users2Visits: document.getElementById("analyticsUsers2Visits"),
  users3Visits: document.getElementById("analyticsUsers3Visits"),
  users5Visits: document.getElementById("analyticsUsers5Visits"),
  retentionTable: document.getElementById("analyticsRetentionTable"),
  totalSearches: document.getElementById("analyticsTotalSearches"),
  searchesPerUser: document.getElementById("analyticsSearchesPerUser"),
  topSearchTerms: document.getElementById("analyticsTopSearchTerms"),
  zeroResultSearches: document.getElementById("analyticsZeroResultSearches"),
  mostUsedFilters: document.getElementById("analyticsMostUsedFilters"),
  searchClickRate: document.getElementById("analyticsSearchClickRate"),
  mostViewedEvents: document.getElementById("analyticsMostViewedEvents"),
  mostFavoritedEvents: document.getElementById("analyticsMostFavoritedEvents"),
  mostExternalClicks: document.getElementById("analyticsMostExternalClicks"),
  eventDetailOpens: document.getElementById("analyticsEventDetailOpens"),
  favoriteConversionRate: document.getElementById("analyticsFavoriteConversionRate"),
  plannerOpens: document.getElementById("analyticsPlannerOpens"),
  plannerUsers: document.getElementById("analyticsPlannerUsers"),
  plannerEventsAdded: document.getElementById("analyticsPlannerEventsAdded"),
  avgPlannedEvents: document.getElementById("analyticsAvgPlannedEvents"),
  priorityMix: document.getElementById("analyticsPriorityMix"),
  mostPlannedEvents: document.getElementById("analyticsMostPlannedEventsV2"),
  recommendationClicks: document.getElementById("analyticsRecommendationClicks"),
  plannerConversionRate: document.getElementById("analyticsPlannerConversionRate"),
  feedbackTotal: document.getElementById("analyticsFeedbackTotal"),
  feedbackNew: document.getElementById("analyticsFeedbackNew"),
  feedbackByCategory: document.getElementById("analyticsFeedbackByCategory"),
  feedbackByRating: document.getElementById("analyticsFeedbackByRating"),
  latestFeedback: document.getElementById("analyticsLatestFeedback")
};

const adminFeedbackElements = {
  list: document.getElementById("adminFeedbackManagementList"),
  summary: document.getElementById("adminFeedbackSummary"),
  newCount: document.getElementById("adminFeedbackNewCount"),
  plannedCount: document.getElementById("adminFeedbackPlannedCount"),
  resolvedCount: document.getElementById("adminFeedbackResolvedCount"),
  category: document.getElementById("feedbackCategoryFilter"),
  status: document.getElementById("feedbackStatusFilter"),
  area: document.getElementById("feedbackAreaFilter"),
  date: document.getElementById("feedbackDateFilter"),
  refresh: document.getElementById("refreshAdminFeedbackBtn")
};

const adminTabs =
  document.querySelectorAll(".admin-tab");

const adminTabPanels =
  document.querySelectorAll(".admin-tab-panel");

const adminAnalyticsStatus =
  document.getElementById("adminAnalyticsStatus");

let currentAdminTab = "review";
let pendingAdminEvents = [];
let localQualityRows = [];
let adminStagingPreviewRows = [];
let adminRefreshInProgress = false;

const ADMIN_TAB_PANEL_IDS = {
  review: "adminReviewPanel",
  quality: "adminQualityPanel",
  feedback: "adminFeedbackPanel",
  analytics: "adminAnalyticsPanel",
  knowledge: "adminKnowledgePanel",
  knowledgeAudit: "adminKnowledgeAuditPanel",
  imports: "adminImportsPanel"
};


adminBtn.onclick = async () => {

  const isAdmin =
    await isCurrentUserAdmin();

  if (!isAdmin) {

    showAppMessage(
      "Admin access required",
      "This dashboard is only available for admin users."
    );

    return;

  }

  adminModal.classList.add("open");

  trackEvent("admin_opened", {
    page: "admin"
  });

  setAdminTab("review");

  initWorldTriathlonImportDates();

  await refreshAdminWorkspace({
    includeSystemStatus: true,
    force: true
  });

};


function setAdminTab(tabName) {
  currentAdminTab =
    ADMIN_TAB_PANEL_IDS[tabName]
      ? tabName
      : "review";

  adminTabs.forEach(tab => {

    tab.classList.toggle(
      "active",
      tab.dataset.adminTab === currentAdminTab
    );

    tab.setAttribute(
      "aria-selected",
      tab.dataset.adminTab === currentAdminTab
        ? "true"
        : "false"
    );

  });

  adminTabPanels.forEach(panel => {
    const isActive =
      panel.id ===
      ADMIN_TAB_PANEL_IDS[currentAdminTab];

    panel.classList.toggle(
      "active",
      isActive
    );

    panel.hidden =
      !isActive;

  });

}

async function loadAdminTab(tabName, options = {}) {
  if (tabName === "review") {
    await Promise.all([
      loadAdminSummary(),
      loadPendingEvents()
    ]);
    return;
  }

  if (tabName === "quality") {
    await loadLocalDataQualitySummary({
      force: options.force
    });
    return;
  }

  if (tabName === "feedback") {
    await loadAdminFeedbackManagement();
    return;
  }

  if (tabName === "analytics") {
    await loadAdminAnalytics();
    return;
  }

  if (tabName === "knowledge") {
    await loadEventKnowledgeAdmin();
    return;
  }

  if (tabName === "knowledgeAudit") {
    await loadKnowledgeAuditAdmin();
    return;
  }

  if (tabName === "imports") {
    initWorldTriathlonImportDates();
  }
}

const KNOWLEDGE_CHILD_TABLES = {
  registration: "event_registration",
  course: "event_course",
  race_day: "event_race_day",
  travel: "event_travel",
  weather: "event_weather",
  statistics: "event_statistics",
  editorial: "event_editorial"
};

let knowledgeEventRows = [];
let knowledgeDetailRows = [];
let currentKnowledgeDetail = null;
let knowledgeAuditRows = [];
let knowledgeReviewTasks = [];
let knowledgeReviewDecisions = {};

const KNOWLEDGE_REVIEW_DECISIONS_KEY =
  "sporteventmap_knowledge_review_decisions";

const KNOWLEDGE_REVIEW_FIELD_TARGETS = {
  entry_fee: {
    tableKey: "registration",
    field: "entry_fee_min"
  },
  registration_status: {
    tableKey: "registration",
    field: "registration_status"
  },
  registration_deadline: {
    tableKey: "registration",
    field: "registration_close_date"
  },
  start_time: {
    tableKey: "race_day",
    field: "start_time"
  },
  cutoff: {
    tableKey: "race_day",
    field: "total_cutoff"
  },
  elevation: {
    tableKey: "course",
    field: "elevation_gain"
  },
  course_info: {
    tableKey: "course",
    field: "course_character"
  },
  race_day_info: {
    tableKey: "race_day",
    field: "bib_pickup_info"
  },
  travel_info: {
    tableKey: "travel",
    field: "public_transport_info"
  },
  weather_info: {
    tableKey: "weather",
    field: "typical_weather"
  },
  statistics: {
    tableKey: "statistics",
    field: "historic_significance"
  }
};

function setKnowledgeStatus(message, type = "") {
  if (!knowledgeElements.status) {
    return;
  }

  knowledgeElements.status.className =
    `admin-section-status ${type}`.trim();
  knowledgeElements.status.textContent =
    message;
}

function setKnowledgeResearchStatus(message, type = "") {
  if (!knowledgeResearchElements.status) {
    return;
  }

  knowledgeResearchElements.status.className =
    `admin-section-status ${type}`.trim();
  knowledgeResearchElements.status.textContent =
    message;
}

function getKnowledgeResearchCommand() {
  const scope =
    knowledgeResearchElements.scope?.value || "high";
  const limit =
    knowledgeResearchElements.limit?.value || "10";
  const parts = [
    "npm run research:event-knowledge --",
    `--scope ${scope}`,
    `--limit ${limit}`
  ];

  if (scope === "current") {
    const slug =
      knowledgeElements.slug?.value ||
      knowledgeElements.eventSelect?.value;

    if (slug) {
      parts.push(`--event-slug ${slug}`);
    }
  }

  return parts.join(" ");
}

function updateKnowledgeResearchCommand() {
  if (!knowledgeResearchElements.command) {
    return;
  }

  knowledgeResearchElements.command.textContent =
    getKnowledgeResearchCommand();
}

function renderKnowledgeResearchProgress(status = {}) {
  if (knowledgeResearchElements.jobStatus) {
    knowledgeResearchElements.jobStatus.textContent =
      status.status || "queued";
  }

  if (knowledgeResearchElements.currentEvent) {
    knowledgeResearchElements.currentEvent.textContent =
      status.current_event || "-";
  }

  if (knowledgeResearchElements.processed) {
    knowledgeResearchElements.processed.textContent =
      `${Number(status.processed_events || 0)} / ${Number(status.total_events || 0)}`;
  }

  if (knowledgeResearchElements.foundFields) {
    knowledgeResearchElements.foundFields.textContent =
      String(Number(status.found_fields || 0));
  }

  if (knowledgeResearchElements.errors) {
    knowledgeResearchElements.errors.textContent =
      String(Array.isArray(status.errors) ? status.errors.length : 0);
  }
}

async function loadKnowledgeResearchStatus() {
  updateKnowledgeResearchCommand();

  const status =
    await fetchKnowledgeWorkflowJson(
      "data/event-knowledge-research-status.json",
      null
    );

  if (!status) {
    renderKnowledgeResearchProgress();
    return;
  }

  renderKnowledgeResearchProgress(status);
}

async function startKnowledgeResearchJob() {
  const scope =
    knowledgeResearchElements.scope?.value || "high";
  const limit =
    Number(knowledgeResearchElements.limit?.value || 10);
  const eventSlug =
    knowledgeElements.slug?.value ||
    knowledgeElements.eventSelect?.value ||
    "";

  updateKnowledgeResearchCommand();

  if (scope === "current" && !eventSlug) {
    setKnowledgeResearchStatus(
      "Current selected event requires an event selection.",
      "error"
    );
    return;
  }

  const queuedStatus = {
    status: "queued",
    scope,
    limit,
    current_event: "",
    processed_events: 0,
    total_events: 0,
    found_fields: 0,
    errors: []
  };

  renderKnowledgeResearchProgress(queuedStatus);
  setKnowledgeResearchStatus("Research job queued...");

  try {
    const response =
      await fetch("api/event-knowledge-research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          scope,
          limit,
          event_slug: eventSlug
        })
      });

    if (!response.ok) {
      throw new Error(`Research API returned ${response.status}`);
    }

    const data =
      await response.json();

    renderKnowledgeResearchProgress(data.status || queuedStatus);
    setKnowledgeResearchStatus(
      "Research backend accepted the job. Refresh status after it completes.",
      "success"
    );
  } catch (_error) {
    setKnowledgeResearchStatus(
      `Static admin cannot execute the local tool directly. Run: ${getKnowledgeResearchCommand()}`,
      "error"
    );
  }
}

function createAdminSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getAdminEventYear(event) {
  const date =
    String(event?.date || "");
  const match =
    date.match(/\b(\d{4})\b/);

  return match ? match[1] : "";
}

function getAdminEventSlug(event) {
  return createAdminSlug(
    [
      event?.event_name,
      getAdminEventYear(event)
    ].filter(Boolean).join(" ")
  );
}

async function loadKnowledgeCsvEvents() {
  try {
    const response =
      await fetch("data/events.csv", {
        cache: "default"
      });

    if (!response.ok) {
      throw new Error(`CSV returned ${response.status}`);
    }

    const text =
      await response.text();

    if (typeof Papa !== "undefined") {
      const parsed =
        Papa.parse(text, {
          header: true,
          delimiter: ";",
          skipEmptyLines: true
        });

      return (parsed.data || [])
        .filter(row => row.event_name)
        .map(row => ({
          ...row,
          event_slug: getAdminEventSlug(row)
        }));
    }

    return text
      .split(/\r?\n/)
      .slice(1)
      .filter(Boolean)
      .map(line => {
        const cells =
          line.split(";");

        const row = {
          event_name: cells[0] || "",
          sport: cells[1] || "",
          date: cells[2] || "",
          city: cells[3] || "",
          country: cells[4] || "",
          address: cells[5] || "",
          distance: cells[8] || "",
          event_url: cells[10] || "",
          source_url: cells[12] || "",
          verification_status: cells[13] || "",
          last_checked: cells[16] || ""
        };

        row.event_slug =
          getAdminEventSlug(row);

        return row;
      });
  } catch (error) {
    console.warn(
      "Could not load CSV events for Knowledge admin:",
      error
    );
    return [];
  }
}

function getKnowledgeSelectedEvent() {
  const slug =
    knowledgeElements.slug?.value ||
    knowledgeElements.eventSelect?.value;

  return knowledgeEventRows.find(event =>
    event.event_slug === slug
  ) || null;
}

function normalizeKnowledgeDetailFromEvent(event) {
  if (!event) {
    return {};
  }

  return {
    event_slug: event.event_slug || getAdminEventSlug(event),
    event_name: event.event_name || "",
    sport_type: event.sport || "",
    date: event.date || "",
    city: event.city || "",
    country: event.country || "",
    official_website: event.event_url || "",
    registration_url: event.event_url || "",
    event_status: event.verification_status || "draft",
    verification_status: "draft",
    is_public: false,
    last_checked: normalizeKnowledgeDate(event.last_checked)
  };
}

function normalizeKnowledgeDate(value) {
  const text =
    String(value || "").trim();

  const german =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);

  if (german) {
    return `${german[3]}-${german[2]}-${german[1]}`;
  }

  return /^\d{4}-\d{2}-\d{2}/.test(text)
    ? text.slice(0, 10)
    : "";
}

function renderKnowledgeEventOptions() {
  if (!knowledgeElements.eventSelect) {
    return;
  }

  const detailSlugs =
    new Set(
      knowledgeDetailRows.map(row => row.event_slug)
    );

  const priorityNames =
    /berlin marathon|frankfurt marathon|k[oö]ln marathon|hamburg marathon|m[uü]nchen|hannover marathon|d[uü]sseldorf marathon|ironman hamburg|ironman frankfurt|challenge roth/i;

  const sorted =
    [...knowledgeEventRows]
      .sort((first, second) => {
        const firstPriority =
          priorityNames.test(first.event_name || "") ? 0 : 1;
        const secondPriority =
          priorityNames.test(second.event_name || "") ? 0 : 1;

        if (firstPriority !== secondPriority) {
          return firstPriority - secondPriority;
        }

        return String(first.event_name || "")
          .localeCompare(String(second.event_name || ""));
      });

  knowledgeElements.eventSelect.innerHTML =
    `<option value="">Event auswählen</option>` +
    sorted.map(event => {
      const label =
        `${event.event_name || "Untitled"} · ${event.date || "-"} · ${event.city || "-"}`;
      const badge =
        detailSlugs.has(event.event_slug)
          ? " [KB]"
          : "";

      return `<option value="${escapeAdminHTML(event.event_slug)}">${escapeAdminHTML(label + badge)}</option>`;
    }).join("");
}

function setKnowledgeField(tableName, fieldName, value) {
  const field =
    knowledgeElements.form
      ?.querySelector(`[data-knowledge-table="${tableName}"][name="${fieldName}"]`);

  if (!field) {
    return;
  }

  if (field.dataset.knowledgeArray === "true") {
    field.value =
      Array.isArray(value)
        ? value.join("\n")
        : String(value || "");
    return;
  }

  if (field.dataset.knowledgeBoolean === "true") {
    field.value =
      value === true
        ? "true"
        : value === false
          ? "false"
          : "";
    return;
  }

  field.value =
    value == null ? "" : String(value);
}

function fillKnowledgeForm(data = {}) {
  knowledgeElements.form
    ?.reset();

  const details =
    data.details || {};

  if (knowledgeElements.slug) {
    knowledgeElements.slug.value =
      details.event_slug || "";
  }

  if (knowledgeElements.verificationStatus) {
    knowledgeElements.verificationStatus.value =
      details.verification_status || "draft";
  }

  if (knowledgeElements.isPublic) {
    knowledgeElements.isPublic.checked =
      Boolean(details.is_public);
  }

  Object.entries(details)
    .forEach(([field, value]) =>
      setKnowledgeField("details", field, value)
    );

  Object.keys(KNOWLEDGE_CHILD_TABLES)
    .forEach(key => {
      Object.entries(data[key] || {})
        .forEach(([field, value]) =>
          setKnowledgeField(key, field, value)
        );
    });

  renderKnowledgeSources(
    data.sources || []
  );
  renderKnowledgeFaq(
    data.faq || []
  );
}

function getKnowledgeSourceTemplate(source = {}) {
  return `
    <article class="admin-knowledge-row" data-knowledge-source>
      <label>Label<input data-source-field="source_label" value="${escapeAdminHTML(source.source_label || "")}" /></label>
      <label>URL<input data-source-field="source_url" type="url" value="${escapeAdminHTML(source.source_url || "")}" /></label>
      <label>Type<select data-source-field="source_type">
        ${["official", "trusted", "community", "estimated", "unknown"].map(type =>
          `<option value="${type}" ${source.source_type === type ? "selected" : ""}>${type}</option>`
        ).join("")}
      </select></label>
      <label>Verified<input data-source-field="last_verified" type="date" value="${escapeAdminHTML(normalizeKnowledgeDate(source.last_verified))}" /></label>
      <label>Confidence<input data-source-field="confidence_score" inputmode="decimal" value="${escapeAdminHTML(source.confidence_score ?? "")}" /></label>
      <label>Note<textarea data-source-field="verification_note" rows="2">${escapeAdminHTML(source.verification_note || "")}</textarea></label>
      <button type="button" data-remove-knowledge-row>Remove</button>
    </article>`;
}

function renderKnowledgeSources(sources = []) {
  if (!knowledgeElements.sources) {
    return;
  }

  const rows =
    sources.length
      ? sources
      : [{ source_type: "official" }];

  knowledgeElements.sources.innerHTML =
    rows.map(getKnowledgeSourceTemplate).join("");
}

function getKnowledgeFaqTemplate(faq = {}) {
  return `
    <article class="admin-knowledge-row" data-knowledge-faq>
      <label>Question<input data-faq-field="question" value="${escapeAdminHTML(faq.question || "")}" /></label>
      <label>Answer<textarea data-faq-field="answer" rows="2">${escapeAdminHTML(faq.answer || "")}</textarea></label>
      <label>Sort<input data-faq-field="sort_order" inputmode="numeric" value="${escapeAdminHTML(faq.sort_order || "100")}" /></label>
      <label>Source URL<input data-faq-field="source_url" type="url" value="${escapeAdminHTML(faq.source_url || "")}" /></label>
      <button type="button" data-remove-knowledge-row>Remove</button>
    </article>`;
}

function renderKnowledgeFaq(faqRows = []) {
  if (!knowledgeElements.faq) {
    return;
  }

  knowledgeElements.faq.innerHTML =
    (faqRows || [])
      .map(getKnowledgeFaqTemplate)
      .join("");
}

async function fetchKnowledgeBundle(slug) {
  const selectedEvent =
    knowledgeEventRows.find(event =>
      event.event_slug === slug
    );

  const fallbackDetails =
    normalizeKnowledgeDetailFromEvent(selectedEvent);

  const detailResult =
    await supabaseClient
      .from("event_details")
      .select("*")
      .eq("event_slug", slug)
      .maybeSingle();

  if (detailResult.error) {
    throw detailResult.error;
  }

  const details =
    detailResult.data || fallbackDetails;

  const bundle = {
    details,
    sources: [],
    faq: []
  };

  if (!detailResult.data?.id) {
    Object.keys(KNOWLEDGE_CHILD_TABLES)
      .forEach(key => {
        bundle[key] = {};
      });
    return bundle;
  }

  const detailId =
    detailResult.data.id;

  await Promise.all(
    Object.entries(KNOWLEDGE_CHILD_TABLES)
      .map(async ([key, table]) => {
        const { data, error } =
          await supabaseClient
            .from(table)
            .select("*")
            .eq("event_detail_id", detailId)
            .maybeSingle();

        if (error) {
          throw error;
        }

        bundle[key] =
          data || {};
      })
  );

  const [sourcesResult, faqResult] =
    await Promise.all([
      supabaseClient
        .from("event_sources")
        .select("*")
        .eq("event_detail_id", detailId)
        .order("created_at", { ascending: true }),
      supabaseClient
        .from("event_faq")
        .select("*")
        .eq("event_detail_id", detailId)
        .order("sort_order", { ascending: true })
    ]);

  if (sourcesResult.error) {
    throw sourcesResult.error;
  }

  if (faqResult.error) {
    throw faqResult.error;
  }

  bundle.sources =
    sourcesResult.data || [];
  bundle.faq =
    faqResult.data || [];

  return bundle;
}

async function loadEventKnowledgeAdmin(options = {}) {
  if (!knowledgeElements.eventSelect) {
    return;
  }

  setKnowledgeStatus("Loading Event Knowledge Base...");

  try {
    const [csvRows, detailResult] =
      await Promise.all([
        loadKnowledgeCsvEvents(),
        supabaseClient
          .from("event_details")
          .select("id,event_slug,event_name,verification_status,is_public,last_checked")
          .order("updated_at", { ascending: false })
      ]);

    if (detailResult.error) {
      throw detailResult.error;
    }

    knowledgeEventRows =
      csvRows;
    knowledgeDetailRows =
      detailResult.data || [];

    renderKnowledgeEventOptions();

    if (adminKnowledgeTabCount) {
      adminKnowledgeTabCount.textContent =
        String(knowledgeDetailRows.length);
    }

    if (options.selectSlug && knowledgeElements.eventSelect) {
      knowledgeElements.eventSelect.value =
        options.selectSlug;
    }

    setKnowledgeStatus(
      `${knowledgeDetailRows.length} Knowledge entries in Supabase. Waehle ein Event zum Bearbeiten.`
    );

    await loadKnowledgeResearchStatus();
  } catch (error) {
    console.error(
      "Event Knowledge admin load failed:",
      error
    );

    setKnowledgeStatus(
      getFriendlyErrorMessage(
        error,
        "Event Knowledge Base could not be loaded. Check the Supabase migration and admin role."
      ),
      "error"
    );
  }
}

async function loadSelectedEventKnowledge() {
  const slug =
    knowledgeElements.eventSelect?.value ||
    knowledgeElements.slug?.value;

  if (!slug) {
    setKnowledgeStatus(
      "Waehle zuerst ein Event.",
      "error"
    );
    return;
  }

  setButtonLoading(
    knowledgeElements.load,
    true,
    "Loading..."
  );
  setKnowledgeStatus("Loading selected event...");

  try {
    const bundle =
      await fetchKnowledgeBundle(slug);

    currentKnowledgeDetail =
      bundle.details;

    fillKnowledgeForm(bundle);

    setKnowledgeStatus(
      bundle.details.id
        ? "Knowledge entry loaded from Supabase."
        : "No Supabase entry yet. Form is prefilled from CSV data."
    );
  } catch (error) {
    console.error(
      "Could not load selected Knowledge event:",
      error
    );

    setKnowledgeStatus(
      getFriendlyErrorMessage(
        error,
        "Selected Knowledge entry could not be loaded."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      knowledgeElements.load,
      false
    );
  }
}

function collectKnowledgeFields(tableName) {
  const payload = {};

  knowledgeElements.form
    ?.querySelectorAll(`[data-knowledge-table="${tableName}"]`)
    .forEach(field => {
      let value =
        field.value.trim();

      if (field.dataset.knowledgeArray === "true") {
        value =
          value
            ? value.split(/\n|,/).map(item => item.trim()).filter(Boolean)
            : [];
      } else if (field.dataset.knowledgeBoolean === "true") {
        value =
          value === "true"
            ? true
            : value === "false"
              ? false
              : null;
      }

      payload[field.name] =
        value;
    });

  return payload;
}

function collectKnowledgeSources() {
  return Array
    .from(document.querySelectorAll("[data-knowledge-source]"))
    .map(row => {
      const source = {};

      row
        .querySelectorAll("[data-source-field]")
        .forEach(field => {
          source[field.dataset.sourceField] =
            field.value.trim();
        });

      source.confidence_score =
        source.confidence_score
          ? Number(source.confidence_score)
          : null;

      source.last_verified =
        normalizeKnowledgeDate(source.last_verified) || null;

      return source;
    })
    .filter(source => source.source_url);
}

function collectKnowledgeFaq() {
  return Array
    .from(document.querySelectorAll("[data-knowledge-faq]"))
    .map(row => {
      const faq = {};

      row
        .querySelectorAll("[data-faq-field]")
        .forEach(field => {
          faq[field.dataset.faqField] =
            field.value.trim();
        });

      faq.sort_order =
        Number(faq.sort_order || 100);

      return faq;
    })
    .filter(faq => faq.question && faq.answer);
}

async function saveSingleKnowledgeChild(table, eventDetailId, payload) {
  const cleaned =
    Object.fromEntries(
      Object.entries(payload)
        .filter(([_key, value]) =>
          value !== "" &&
          value !== null &&
          !(Array.isArray(value) && !value.length)
        )
    );

  const existing =
    await supabaseClient
      .from(table)
      .select("id")
      .eq("event_detail_id", eventDetailId)
      .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data?.id) {
    const { error } =
      await supabaseClient
        .from(table)
        .update(cleaned)
        .eq("id", existing.data.id);

    if (error) {
      throw error;
    }
    return;
  }

  const { error } =
    await supabaseClient
      .from(table)
      .insert([{
        event_detail_id: eventDetailId,
        ...cleaned
      }]);

  if (error) {
    throw error;
  }
}

async function replaceKnowledgeRows(table, eventDetailId, rows) {
  const deleteResult =
    await supabaseClient
      .from(table)
      .delete()
      .eq("event_detail_id", eventDetailId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  if (!rows.length) {
    return;
  }

  const { error } =
    await supabaseClient
      .from(table)
      .insert(
        rows.map(row => ({
          event_detail_id: eventDetailId,
          ...row
        }))
      );

  if (error) {
    throw error;
  }
}

async function saveSelectedEventKnowledge() {
  const slug =
    knowledgeElements.slug?.value.trim() ||
    knowledgeElements.eventSelect?.value;

  if (!slug) {
    setKnowledgeStatus(
      "Slug fehlt. Waehle ein Event oder gib einen Slug ein.",
      "error"
    );
    return;
  }

  setButtonLoading(
    knowledgeElements.save,
    true,
    "Saving..."
  );
  setKnowledgeStatus("Saving Knowledge entry...");

  try {
    const detailPayload = {
      ...collectKnowledgeFields("details"),
      event_slug: slug,
      verification_status:
        knowledgeElements.verificationStatus?.value || "draft",
      is_public:
        Boolean(knowledgeElements.isPublic?.checked)
    };

    detailPayload.last_checked =
      normalizeKnowledgeDate(detailPayload.last_checked) || null;

    const selectedEvent =
      getKnowledgeSelectedEvent();

    if (!detailPayload.event_name && selectedEvent) {
      detailPayload.event_name =
        selectedEvent.event_name;
    }

    if (!detailPayload.event_name) {
      throw new Error("Event name is required.");
    }

    const detailResult =
      await supabaseClient
        .from("event_details")
        .upsert(detailPayload, {
          onConflict: "event_slug"
        })
        .select("*")
        .single();

    if (detailResult.error) {
      throw detailResult.error;
    }

    const eventDetailId =
      detailResult.data.id;

    for (const [key, table] of Object.entries(KNOWLEDGE_CHILD_TABLES)) {
      await saveSingleKnowledgeChild(
        table,
        eventDetailId,
        collectKnowledgeFields(key)
      );
    }

    await replaceKnowledgeRows(
      "event_sources",
      eventDetailId,
      collectKnowledgeSources()
    );

    await replaceKnowledgeRows(
      "event_faq",
      eventDetailId,
      collectKnowledgeFaq()
    );

    currentKnowledgeDetail =
      detailResult.data;

    await loadEventKnowledgeAdmin({
      selectSlug: slug
    });

    setKnowledgeStatus(
      "Knowledge entry saved. Run the Supabase export/build step before the static detail page changes go live.",
      "success"
    );
  } catch (error) {
    console.error(
      "Could not save Knowledge entry:",
      error
    );

    setKnowledgeStatus(
      getFriendlyErrorMessage(
        error,
        "Knowledge entry could not be saved. Check admin RLS policies and required fields."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      knowledgeElements.save,
      false
    );
  }
}

function setKnowledgeAuditStatus(message, type = "") {
  if (!knowledgeAuditElements.status) {
    return;
  }

  knowledgeAuditElements.status.className =
    `admin-section-status ${type}`.trim();
  knowledgeAuditElements.status.textContent =
    message;
}

async function fetchKnowledgeWorkflowJson(url, fallback) {
  try {
    const response =
      await fetch(url, {
        cache: "no-store"
      });

    if (!response.ok) {
      return fallback;
    }

    return response.json();
  } catch (_error) {
    return fallback;
  }
}

function getKnowledgeReviewTask(slug) {
  return knowledgeReviewTasks.find(task =>
    task.event_slug === slug
  ) || null;
}

function loadKnowledgeReviewDecisions() {
  try {
    knowledgeReviewDecisions =
      JSON.parse(
        localStorage.getItem(KNOWLEDGE_REVIEW_DECISIONS_KEY) || "{}"
      ) || {};
  } catch (_error) {
    knowledgeReviewDecisions = {};
  }
}

function saveKnowledgeReviewDecisions() {
  localStorage.setItem(
    KNOWLEDGE_REVIEW_DECISIONS_KEY,
    JSON.stringify(knowledgeReviewDecisions)
  );
}

function getKnowledgeReviewDecision(slug, field) {
  return knowledgeReviewDecisions[`${slug}:${field}`] || null;
}

function setKnowledgeReviewDecision(slug, field, decision) {
  knowledgeReviewDecisions[`${slug}:${field}`] = {
    ...decision,
    updated_at: new Date().toISOString()
  };
  saveKnowledgeReviewDecisions();
}

function getKnowledgeReviewFieldRows(task) {
  const fields =
    task?.fields && Object.keys(task.fields).length
      ? task.fields
      : (task?.proposals || []).reduce((map, proposal) => {
        if (proposal.field_name) {
          map[proposal.field_name] = {
            ...proposal,
            value: proposal.suggested_value || proposal.value || ""
          };
        }

        return map;
      }, {});

  return Object.entries(fields || {})
    .map(([field, proposal]) => ({
      field,
      proposal: proposal || {},
      decision: getKnowledgeReviewDecision(task.event_slug, field)
    }))
    .filter(({ proposal, decision }) =>
      Boolean(
        decision ||
        (
          (proposal.source_url || proposal.sourceUrl) &&
          (proposal.suggested_value || proposal.value)
        )
      )
    );
}

function getKnowledgeFieldInput(card, field, name) {
  return card?.querySelector(
    `[data-review-field="${field}"][data-review-input="${name}"]`
  );
}

function getKnowledgeEditedProposal(card, field) {
  return {
    value:
      getKnowledgeFieldInput(card, field, "value")?.value.trim() || "",
    suggested_value:
      getKnowledgeFieldInput(card, field, "value")?.value.trim() || "",
    source_url:
      getKnowledgeFieldInput(card, field, "source_url")?.value.trim() || "",
    source_title:
      getKnowledgeFieldInput(card, field, "source_title")?.value.trim() || "",
    confidence:
      Number(getKnowledgeFieldInput(card, field, "confidence")?.value || 0),
    verification_status:
      getKnowledgeFieldInput(card, field, "verification_status")?.value || "needs_review",
    last_checked:
      normalizeKnowledgeDate(getKnowledgeFieldInput(card, field, "last_checked")?.value || "") || null,
    note:
      getKnowledgeFieldInput(card, field, "note")?.value.trim() || ""
  };
}

async function ensureKnowledgeDetailForTask(task) {
  const details =
    task.supabase_payload?.details || {};

  const detailPayload = {
    event_slug: task.event_slug,
    event_name: task.event_name,
    sport_type: task.sport || details.sport_type || "",
    date: task.date || details.date || "",
    city: task.city || details.city || "",
    country: task.country || details.country || "",
    official_website:
      details.official_website ||
      task.research_sources?.[0] ||
      "",
    registration_url:
      details.registration_url ||
      task.research_sources?.[0] ||
      "",
    verification_status: "needs_review",
    is_public: false,
    last_checked:
      normalizeKnowledgeDate(details.last_checked) ||
      new Date().toISOString().slice(0, 10)
  };

  const result =
    await supabaseClient
      .from("event_details")
      .upsert(detailPayload, {
        onConflict: "event_slug"
      })
      .select("*")
      .single();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}

async function saveKnowledgeReviewSource(eventDetailId, field, proposal) {
  if (!proposal.source_url) {
    return;
  }

  const sourcePayload = {
    event_detail_id: eventDetailId,
    source_label:
      proposal.source_title ||
      `${field} review source`,
    source_url: proposal.source_url,
    source_type: "official",
    last_verified:
      proposal.last_checked ||
      new Date().toISOString().slice(0, 10),
    confidence_score:
      Number.isFinite(proposal.confidence)
        ? proposal.confidence
        : null,
    verification_note:
      proposal.note ||
      `Accepted review source for ${field}.`
  };

  const { error } =
    await supabaseClient
      .from("event_sources")
      .insert([sourcePayload]);

  if (error) {
    throw error;
  }
}

async function saveKnowledgeReviewFaq(eventDetailId, proposal) {
  const value =
    String(proposal.value || "").trim();

  if (!value) {
    throw new Error("FAQ proposal needs a question and answer before it can be accepted.");
  }

  const parts =
    value.split(/\n+/).map(part => part.trim()).filter(Boolean);
  const question =
    parts[0] || "Event FAQ";
  const answer =
    parts.slice(1).join(" ") || parts[0] || "";

  if (!answer || question === answer) {
    throw new Error("FAQ proposal needs a separate answer before it can be accepted.");
  }

  const { error } =
    await supabaseClient
      .from("event_faq")
      .insert([{
        event_detail_id: eventDetailId,
        question,
        answer,
        sort_order: 100,
        source_url: proposal.source_url || null
      }]);

  if (error) {
    throw error;
  }
}

async function acceptKnowledgeReviewField(task, field, proposal) {
  if (!proposal.source_url) {
    throw new Error("Accepted Knowledge values need a source URL.");
  }

  if (!String(proposal.value || "").trim() && field !== "sources") {
    throw new Error("Accepted Knowledge values need a value.");
  }

  const detail =
    await ensureKnowledgeDetailForTask(task);

  if (field === "sources") {
    await saveKnowledgeReviewSource(detail.id, field, proposal);
    return;
  }

  if (field === "faq") {
    await saveKnowledgeReviewFaq(detail.id, proposal);
    await saveKnowledgeReviewSource(detail.id, field, proposal);
    return;
  }

  const target =
    KNOWLEDGE_REVIEW_FIELD_TARGETS[field];

  if (!target) {
    throw new Error(`No Supabase target mapping for ${field}.`);
  }

  const table =
    KNOWLEDGE_CHILD_TABLES[target.tableKey];

  if (!table) {
    throw new Error(`Missing Supabase table for ${field}.`);
  }

  await saveSingleKnowledgeChild(
    table,
    detail.id,
    {
      [target.field]: proposal.value
    }
  );

  await saveKnowledgeReviewSource(detail.id, field, proposal);
}

function getKnowledgeAuditFilteredRows() {
  const priority =
    knowledgeAuditElements.priority?.value || "high";
  const query =
    String(knowledgeAuditElements.search?.value || "")
      .trim()
      .toLowerCase();

  return knowledgeAuditRows
    .filter(row =>
      priority === "all" ||
      row.priority === priority
    )
    .filter(row => {
      if (!query) {
        return true;
      }

      return [
        row.event_name,
        row.city,
        row.country,
        row.sport,
        row.distance,
        ...(row.missing_fields || [])
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((first, second) =>
      String(first.priority).localeCompare(String(second.priority)) ||
      Number(first.completion_score || 0) - Number(second.completion_score || 0) ||
      String(first.event_name || "").localeCompare(String(second.event_name || ""))
    );
}

function renderKnowledgeAuditAdmin() {
  if (!knowledgeAuditElements.list) {
    return;
  }

  const rows =
    getKnowledgeAuditFilteredRows();

  if (adminKnowledgeAuditTabCount) {
    adminKnowledgeAuditTabCount.textContent =
      String(knowledgeAuditRows.filter(row => row.priority === "high").length);
  }

  if (knowledgeAuditElements.total) {
    knowledgeAuditElements.total.textContent =
      String(knowledgeAuditRows.length);
  }

  if (knowledgeAuditElements.average) {
    const average =
      knowledgeAuditRows.length
        ? (
          knowledgeAuditRows.reduce((sum, row) =>
            sum + Number(row.completion_score || 0), 0
          ) / knowledgeAuditRows.length
        ).toFixed(1)
        : 0;

    knowledgeAuditElements.average.textContent =
      `${average}%`;
  }

  if (knowledgeAuditElements.high) {
    knowledgeAuditElements.high.textContent =
      String(knowledgeAuditRows.filter(row => row.priority === "high").length);
  }

  if (knowledgeAuditElements.review) {
    knowledgeAuditElements.review.textContent =
      String(knowledgeReviewTasks.length);
  }

  if (!rows.length) {
    knowledgeAuditElements.list.innerHTML =
      `<p class="admin-empty-state">No Knowledge audit rows match the current filter.</p>`;
    return;
  }

  knowledgeAuditElements.list.innerHTML =
    rows.slice(0, 150).map(row => {
      const task =
        getKnowledgeReviewTask(row.event_slug);
      const reviewFields =
        getKnowledgeReviewFieldRows(task);
      const missing =
        (row.missing_fields || [])
          .map(field => `<span>${escapeAdminHTML(field)}</span>`)
          .join("");
      const score =
        Number(row.completion_score || 0);
      const fieldRows =
        task
          ? reviewFields.map(({ field, proposal, decision }) => {
            const status =
              decision?.status || "pending";
            const value =
              decision?.value ?? proposal.suggested_value ?? proposal.value ?? "";
            const sourceUrl =
              decision?.source_url ?? proposal.source_url ?? "";
            const sourceTitle =
              decision?.source_title ?? proposal.source_title ?? "";
            const confidence =
              decision?.confidence ?? proposal.confidence ?? 0;
            const verificationStatus =
              decision?.verification_status || proposal.verification_status || "needs_review";
            const lastChecked =
              normalizeKnowledgeDate(decision?.last_checked || proposal.last_checked || "");
            const note =
              decision?.note ?? proposal.note ?? "";

            return `
              <article class="admin-knowledge-review-field ${escapeAdminHTML(status)}" data-review-field-row="${escapeAdminHTML(field)}">
                <div class="admin-knowledge-review-field-heading">
                  <div>
                    <span>${escapeAdminHTML(field)}</span>
                    <strong>${escapeAdminHTML(status)}</strong>
                  </div>
                  <div class="admin-knowledge-review-field-actions">
                    <button type="button" data-knowledge-review-action="accept" data-review-field-name="${escapeAdminHTML(field)}">Accept</button>
                    <button type="button" data-knowledge-review-action="reject" data-review-field-name="${escapeAdminHTML(field)}">Reject</button>
                    <button type="button" data-knowledge-review-action="edit" data-review-field-name="${escapeAdminHTML(field)}">Edit</button>
                  </div>
                </div>
                <div class="admin-knowledge-review-field-grid">
                  <label>Value<textarea data-review-field="${escapeAdminHTML(field)}" data-review-input="value" rows="2">${escapeAdminHTML(value)}</textarea></label>
                  <label>Source URL<input data-review-field="${escapeAdminHTML(field)}" data-review-input="source_url" type="url" value="${escapeAdminHTML(sourceUrl)}" /></label>
                  <label>Source title<input data-review-field="${escapeAdminHTML(field)}" data-review-input="source_title" value="${escapeAdminHTML(sourceTitle)}" /></label>
                  <label>Confidence<input data-review-field="${escapeAdminHTML(field)}" data-review-input="confidence" inputmode="decimal" value="${escapeAdminHTML(confidence)}" /></label>
                  <label>Status<select data-review-field="${escapeAdminHTML(field)}" data-review-input="verification_status">
                    ${["needs_review", "verified_official_source", "partially_verified", "rejected", "needs_research"].map(option =>
                      `<option value="${option}" ${verificationStatus === option ? "selected" : ""}>${option}</option>`
                    ).join("")}
                  </select></label>
                  <label>Last checked<input data-review-field="${escapeAdminHTML(field)}" data-review-input="last_checked" type="date" value="${escapeAdminHTML(lastChecked)}" /></label>
                  <label>Note<textarea data-review-field="${escapeAdminHTML(field)}" data-review-input="note" rows="2">${escapeAdminHTML(note)}</textarea></label>
                </div>
              </article>`;
          }).join("")
          : `<p class="admin-empty-state">No enrichment task yet. Run npm run enrich:event-knowledge for this priority.</p>`;

      return `
        <article class="admin-knowledge-audit-card" data-knowledge-audit-slug="${escapeAdminHTML(row.event_slug)}">
          <div class="admin-knowledge-audit-card-main">
            <div>
              <span class="admin-knowledge-audit-priority ${escapeAdminHTML(row.priority)}">${escapeAdminHTML(row.priority)}</span>
              <h4>${escapeAdminHTML(row.event_name || "Untitled event")}</h4>
              <p>${escapeAdminHTML([row.date, row.city, row.country, row.sport, row.distance].filter(Boolean).join(" · "))}</p>
            </div>
            <div class="admin-knowledge-audit-score" style="--score:${score}">
              <strong>${score}%</strong>
              <span>complete</span>
            </div>
          </div>
          <div class="admin-knowledge-audit-missing">
            ${missing || "<span>Complete</span>"}
          </div>
          <div class="admin-knowledge-audit-actions">
            <a href="${escapeAdminHTML(row.official_url || "#")}" target="_blank" rel="noopener noreferrer">Official source</a>
            <button type="button" data-knowledge-audit-action="review" ${task ? "" : "disabled"}>Review enrichment</button>
          </div>
          <div class="admin-knowledge-review-fields">
            ${fieldRows}
          </div>
        </article>`;
    }).join("");
}

async function loadKnowledgeAuditAdmin() {
  if (!knowledgeAuditElements.list) {
    return;
  }

  setKnowledgeAuditStatus("Loading Knowledge audit files...");

  const [audit, review] =
    await Promise.all([
      fetchKnowledgeWorkflowJson("data/event-knowledge-audit.json", null),
      fetchKnowledgeWorkflowJson("data/event-knowledge-review.json", null)
    ]);

  knowledgeAuditRows =
    Array.isArray(audit?.events)
      ? audit.events
      : [];
  knowledgeReviewTasks =
    Array.isArray(review?.tasks)
      ? review.tasks
      : [];
  loadKnowledgeReviewDecisions();

  renderKnowledgeAuditAdmin();

  if (!knowledgeAuditRows.length) {
    setKnowledgeAuditStatus(
      "No audit file found yet. Run npm run audit:event-knowledge.",
      "error"
    );
    return;
  }

  setKnowledgeAuditStatus(
    `${knowledgeAuditRows.length} audited events loaded. ${knowledgeReviewTasks.length} review task(s) available.`
  );
}

function applyKnowledgeReviewToForm(task) {
  if (!task?.supabase_payload) {
    setKnowledgeAuditStatus(
      "No review payload available for this event.",
      "error"
    );
    return false;
  }

  const payload = {
    ...task.supabase_payload,
    details: {
      ...(task.supabase_payload.details || {}),
      verification_status: "needs_review",
      is_public: false
    }
  };

  fillKnowledgeForm(payload);

  if (knowledgeElements.eventSelect) {
    knowledgeElements.eventSelect.value =
      payload.details.event_slug || "";
  }

  setKnowledgeStatus(
    "Review enrichment loaded. Check fields and sources before saving or publishing.",
    "success"
  );

  return true;
}

async function openKnowledgeReview(task) {
  setAdminTab("knowledge");
  await loadEventKnowledgeAdmin({
    selectSlug: task.event_slug
  });
  applyKnowledgeReviewToForm(task);
}

async function applyKnowledgeReviewToSupabase(task) {
  setAdminTab("knowledge");
  await loadEventKnowledgeAdmin({
    selectSlug: task.event_slug
  });

  if (!applyKnowledgeReviewToForm(task)) {
    return;
  }

  await saveSelectedEventKnowledge();

  setKnowledgeStatus(
    "Review enrichment saved to Supabase as needs_review with Public disabled.",
    "success"
  );
}

function markAdminUpdated() {
  if (!adminLastUpdated) {
    return;
  }

  adminLastUpdated.textContent =
    `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
}

async function refreshAdminWorkspace(options = {}) {
  if (adminRefreshInProgress) {
    return;
  }

  adminRefreshInProgress = true;

  setButtonLoading(
    refreshAdminDashboardBtn,
    true,
    "Refreshing..."
  );

  try {
    const tasks = [
      loadAdminTab(
        currentAdminTab,
        options
      )
    ];

    if (options.includeSystemStatus) {
      tasks.push(
        loadAdminSystemStatus()
      );
    }

    await Promise.all(tasks);
    markAdminUpdated();
  } catch (error) {
    console.error(
      "Admin dashboard refresh failed:",
      error
    );

    showAppMessage(
      "Dashboard refresh failed",
      getFriendlyErrorMessage(
        error,
        "The admin dashboard could not be refreshed."
      )
    );
  } finally {
    adminRefreshInProgress = false;
    setButtonLoading(
      refreshAdminDashboardBtn,
      false
    );
  }
}


adminModal.addEventListener(
  "click",
  async event => {

    const tab =
      event.target.closest(".admin-tab");

    if (!tab) {
      if (event.target === adminModal) {
        adminModal.classList.remove("open");
      }
      return;
    }

    setAdminTab(
      tab.dataset.adminTab
    );

    await loadAdminTab(
      tab.dataset.adminTab
    );

  }
);

[
  adminFeedbackElements.category,
  adminFeedbackElements.status,
  adminFeedbackElements.area,
  adminFeedbackElements.date
]
  .filter(Boolean)
  .forEach(element => {
    element.addEventListener(
      "change",
      loadAdminFeedbackManagement
    );
  });

adminFeedbackElements.refresh
  ?.addEventListener(
    "click",
    loadAdminFeedbackManagement
  );

knowledgeElements.refresh
  ?.addEventListener(
    "click",
    () => loadEventKnowledgeAdmin({
      force: true
    })
  );

knowledgeElements.load
  ?.addEventListener(
    "click",
    loadSelectedEventKnowledge
  );

knowledgeElements.save
  ?.addEventListener(
    "click",
    saveSelectedEventKnowledge
  );

knowledgeElements.eventSelect
  ?.addEventListener(
    "change",
    () => {
      if (knowledgeElements.slug) {
        knowledgeElements.slug.value =
          knowledgeElements.eventSelect.value;
      }

      updateKnowledgeResearchCommand();
      loadSelectedEventKnowledge();
    }
  );

knowledgeResearchElements.scope
  ?.addEventListener(
    "change",
    updateKnowledgeResearchCommand
  );

knowledgeResearchElements.limit
  ?.addEventListener(
    "input",
    updateKnowledgeResearchCommand
  );

knowledgeResearchElements.start
  ?.addEventListener(
    "click",
    startKnowledgeResearchJob
  );

knowledgeElements.addSource
  ?.addEventListener(
    "click",
    () => {
      knowledgeElements.sources
        ?.insertAdjacentHTML(
          "beforeend",
          getKnowledgeSourceTemplate({
            source_type: "official"
          })
        );
    }
  );

knowledgeElements.addFaq
  ?.addEventListener(
    "click",
    () => {
      knowledgeElements.faq
        ?.insertAdjacentHTML(
          "beforeend",
      getKnowledgeFaqTemplate()
        );
    }
  );

knowledgeAuditElements.refresh
  ?.addEventListener(
    "click",
    loadKnowledgeAuditAdmin
  );

knowledgeAuditElements.priority
  ?.addEventListener(
    "change",
    renderKnowledgeAuditAdmin
  );

knowledgeAuditElements.search
  ?.addEventListener(
    "input",
    renderKnowledgeAuditAdmin
  );

knowledgeAuditElements.list
  ?.addEventListener(
    "click",
    async event => {
      const reviewButton =
        event.target.closest("[data-knowledge-review-action]");

      if (reviewButton) {
        const card =
          reviewButton.closest("[data-knowledge-audit-slug]");
        const slug =
          card?.dataset.knowledgeAuditSlug;
        const field =
          reviewButton.dataset.reviewFieldName;
        const task =
          getKnowledgeReviewTask(slug);

        if (!task || !field) {
          setKnowledgeAuditStatus(
            "Review proposal could not be found.",
            "error"
          );
          return;
        }

        const proposal =
          getKnowledgeEditedProposal(card, field);
        const action =
          reviewButton.dataset.knowledgeReviewAction;

        setButtonLoading(
          reviewButton,
          true,
          action === "accept"
            ? "Saving..."
            : action === "reject"
              ? "Rejecting..."
              : "Editing..."
        );

        try {
          if (action === "accept") {
            await acceptKnowledgeReviewField(
              task,
              field,
              proposal
            );

            setKnowledgeReviewDecision(
              slug,
              field,
              {
                ...proposal,
                status: "accepted",
                verification_status:
                  proposal.verification_status === "needs_research"
                    ? "needs_review"
                    : proposal.verification_status
              }
            );

            setKnowledgeAuditStatus(
              `${field} accepted and saved to Supabase as non-public Knowledge data.`,
              "success"
            );
          } else if (action === "reject") {
            setKnowledgeReviewDecision(
              slug,
              field,
              {
                ...proposal,
                status: "rejected",
                verification_status: "rejected"
              }
            );

            setKnowledgeAuditStatus(
              `${field} marked as rejected.`,
              "success"
            );
          } else {
            setKnowledgeReviewDecision(
              slug,
              field,
              {
                ...proposal,
                status: "edited"
              }
            );

            setKnowledgeAuditStatus(
              `${field} edit saved in the review queue. Accept it to write to Supabase.`,
              "success"
            );
          }

          renderKnowledgeAuditAdmin();
        } catch (error) {
          console.error(
            "Knowledge review action failed:",
            error
          );

          setKnowledgeAuditStatus(
            getFriendlyErrorMessage(
              error,
              "Knowledge review action failed."
            ),
            "error"
          );
        } finally {
          setButtonLoading(
            reviewButton,
            false
          );
        }

        return;
      }

      const actionButton =
        event.target.closest("[data-knowledge-audit-action]");

      if (!actionButton) {
        return;
      }

      const card =
        actionButton.closest("[data-knowledge-audit-slug]");
      const task =
        getKnowledgeReviewTask(card?.dataset.knowledgeAuditSlug);

      if (!task) {
        setKnowledgeAuditStatus(
          "No review task available for this event. Run npm run enrich:event-knowledge.",
          "error"
        );
        return;
      }

      setButtonLoading(
        actionButton,
        true,
        actionButton.dataset.knowledgeAuditAction === "apply"
          ? "Applying..."
          : "Opening..."
      );

      try {
        if (actionButton.dataset.knowledgeAuditAction === "apply") {
          await applyKnowledgeReviewToSupabase(task);
        } else {
          await openKnowledgeReview(task);
        }
      } finally {
        setButtonLoading(
          actionButton,
          false
        );
      }
    }
  );

[
  knowledgeElements.sources,
  knowledgeElements.faq
]
  .filter(Boolean)
  .forEach(container => {
    container.addEventListener(
      "click",
      event => {
        const button =
          event.target.closest("[data-remove-knowledge-row]");

        if (!button) {
          return;
        }

        button
          .closest(".admin-knowledge-row")
          ?.remove();
      }
    );
  });

analyticsElements.range
  ?.addEventListener(
    "change",
    loadAdminAnalytics
  );

analyticsElements.refresh
  ?.addEventListener(
    "click",
    loadAdminAnalytics
  );

document.addEventListener(
  "app-language-changed",
  () => {
    updateEventSubmitPreview();

    if (
      authModal.classList.contains("open")
    ) {
      authTitle.innerText =
        authMode === "login"
          ? window.t(
              "auth.welcome",
              "Welcome Back"
            )
          : window.t(
              "auth.create",
              "Create Account"
            );
    }

    if (
      currentAdminTab === "analytics" &&
      adminModal.classList.contains("open")
    ) {
      loadAdminAnalytics();
    }
  }
);

qualityReviewSort
  ?.addEventListener(
    "change",
    () => renderQualityPriorityQueue(
      localQualityRows
    )
  );

[
  pendingEventSearch,
  pendingEventFilter,
  pendingBatchFilter,
  pendingEventSort
]
  .filter(Boolean)
  .forEach(element => {
    element.addEventListener(
      element === pendingEventSearch
        ? "input"
        : "change",
      renderPendingEvents
    );
  });

refreshPendingEventsBtn
  ?.addEventListener(
    "click",
    loadPendingEvents
  );

approveSelectedPendingBtn
  ?.addEventListener(
    "click",
    () => approvePendingBatch("selected")
  );

approveVisibleReadyBtn
  ?.addEventListener(
    "click",
    () => approvePendingBatch("visible")
  );

refreshDataQualityBtn
  ?.addEventListener(
    "click",
    () => loadLocalDataQualitySummary({
      force: true
    })
  );

applyQualityBulkActionBtn
  ?.addEventListener(
    "click",
    applyQualityBulkAction
  );

refreshAdminDashboardBtn
  ?.addEventListener(
    "click",
    () => refreshAdminWorkspace({
      includeSystemStatus: true,
      force: true
    })
  );

previewStagingCsvBtn
  ?.addEventListener(
    "click",
    previewLocalStagingCsv
  );

saveStagingCsvBtn
  ?.addEventListener(
    "click",
    saveLocalStagingCsvToSupabase
  );


document
  .getElementById("closeAdminModal")
  .onclick = () => {

    adminModal.classList.remove("open");

  };

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Escape" &&
      adminModal.classList.contains("open")
    ) {
      adminModal.classList.remove("open");
    }
  }
);

function isMissingSupabaseRelation(error) {
  const message =
    String(error?.message || "")
      .toLowerCase();

  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("could not find the table") ||
    message.includes("does not exist")
  );
}

async function loadAdminSystemStatus() {
  if (!adminSystemStatus) {
    return;
  }

  adminSystemStatus.className =
    "admin-system-status is-loading";

  adminSystemStatus.textContent =
    "Checking database setup...";

  const tables = [
    ["events", "Events"],
    ["profiles", "Profiles"],
    ["favorites", "Favorites"],
    ["season_planner_events", "Season"],
    ["user_feedback", "Feedback"],
    ["analytics_events", "Analytics"]
  ];

  const results =
    await Promise.all(
      tables.map(async ([table, label]) => {
        const { error } =
          await supabaseClient
            .from(table)
            .select("*", {
              count: "exact",
              head: true
            });

        return {
          table,
          label,
          ready: !error,
          missing:
            isMissingSupabaseRelation(error),
          error
        };
      })
    );

  const unavailable =
    results.filter(result =>
      !result.ready
    );

  adminSystemStatus.className =
    unavailable.length
      ? "admin-system-status has-warning"
      : "admin-system-status is-ready";

  adminSystemStatus.innerHTML = `
    <div class="admin-system-heading">
      <strong>
        ${unavailable.length
          ? "Database setup needs attention"
          : "Database ready"}
      </strong>
      <span>
        ${unavailable.length
          ? "Run the closed-beta migrations for unavailable modules."
          : "All admin data modules are reachable with the current role."}
      </span>
    </div>
    <div class="admin-system-chips">
      ${results.map(result => `
        <span class="admin-system-chip ${result.ready ? "is-ready" : "has-warning"}">
          ${escapeAdminHTML(result.label)}
          <strong>${result.ready ? "Ready" : result.missing ? "Missing" : "Blocked"}</strong>
        </span>
      `).join("")}
    </div>
  `;

  unavailable.forEach(result => {
    console.warn(
      `Admin module ${result.table} is unavailable:`,
      result.error?.message || result.error
    );
  });
}


async function getEventCountByStatus(status) {

  const {
    count,
    error
  } = await supabaseClient
    .from("events")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq("status", status);

  if (error) {

    console.error(error);

    return 0;

  }

  return count || 0;

}

async function getRecentEventCountByStatus(status, sinceDate) {

  const {
    count,
    error
  } = await supabaseClient
    .from("events")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq("status", status)
    .gte("created_at", sinceDate);

  if (error) {

    console.error(error);

    return 0;

  }

  return count || 0;

}


async function loadAdminSummary() {
  [
    pendingCount,
    approvedCount,
    rejectedCount,
    missingCoordsCount,
    approvedLast30Count,
    rejectedLast30Count
  ]
    .filter(Boolean)
    .forEach(element => {
      element.textContent = "—";
    });

  let {
    data,
    error
  } = await supabaseClient
    .from("events")
    .select(
      "id, status, latitude, longitude, created_at, updated_at, reviewed_at"
    )
    .limit(5000);

  if (
    error &&
    String(error.message || "")
      .toLowerCase()
      .includes("reviewed_at")
  ) {
    const fallback =
      await supabaseClient
        .from("events")
        .select(
          "id, status, latitude, longitude, created_at, updated_at"
        )
        .limit(5000);

    data =
      fallback.data;

    error =
      fallback.error;
  }

  if (error) {
    console.error(
      "Could not load admin event summary:",
      error
    );

    if (pendingEventsSummary) {
      pendingEventsSummary.textContent =
        "Event summary unavailable. Check the admin role and RLS migration.";
    }

    return;
  }

  const rows =
    data || [];

  const since =
    Date.now() -
    30 * 24 * 60 * 60 * 1000;

  const countStatus =
    status =>
      rows.filter(row =>
        row.status === status
      ).length;

  const reviewStatuses = [
    "pending",
    "staging",
    "needs_review",
    "date_expected"
  ];

  const countRecentStatus =
    status =>
      rows.filter(row => {
        if (row.status !== status) {
          return false;
        }

        const timestamp =
          Date.parse(
            row.reviewed_at ||
            row.updated_at ||
            row.created_at ||
            ""
          );

        return (
          Number.isFinite(timestamp) &&
          timestamp >= since
        );
      }).length;

  const pendingTotal =
    rows.filter(row =>
      reviewStatuses.includes(row.status)
    ).length;

  const approvedTotal =
    countStatus("approved");

  const rejectedTotal =
    countStatus("rejected");

  const missingCoordinates =
    rows.filter(row =>
      row.status === "pending" &&
      !hasValidCoordinates(row)
    ).length;

  pendingCount.textContent =
    pendingTotal;

  approvedCount.textContent =
    approvedTotal;

  rejectedCount.textContent =
    rejectedTotal;

  missingCoordsCount.textContent =
    missingCoordinates;

  approvedLast30Count.textContent =
    countRecentStatus("approved");

  rejectedLast30Count.textContent =
    countRecentStatus("rejected");

  if (adminPendingTabCount) {
    adminPendingTabCount.textContent =
      pendingTotal;
  }

}

async function getAnalyticsCount(eventName = null, sinceDate = null) {
  let query =
    supabaseClient
      .from("analytics_events")
      .select("*", {
        count: "exact",
        head: true
      });

  if (eventName) {
    query = query.eq("event_name", eventName);
  }

  if (sinceDate) {
    query = query.gte("created_at", sinceDate);
  }

  const { count, error } =
    await query;

  if (error) {
    console.warn(
      "Could not load analytics count.",
      eventName || "total",
      error.message
    );

    return null;
  }

  return count || 0;
}

async function getTableCount(tableName, sinceDate = null) {
  let query =
    supabaseClient
      .from(tableName)
      .select("*", {
        count: "exact",
        head: true
      });

  if (sinceDate) {
    query = query.gte("created_at", sinceDate);
  }

  const { count, error } =
    await query;

  if (error) {
    console.warn(
      `Could not load ${tableName} count.`,
      error.message
    );

    return null;
  }

  return count || 0;
}

function setAnalyticsNumber(element, value) {
  if (element) {
    element.textContent =
      value === null
        ? "—"
        : String(value || 0);
  }
}

function setAnalyticsLast7(element, value) {
  if (element) {
    element.textContent =
      value === null
        ? "Unavailable"
        : `${value || 0} last 7 days`;
  }
}

function setAnalyticsRatio(element, numerator, denominator) {
  if (!element) {
    return;
  }

  if (
    numerator === null ||
    denominator === null
  ) {
    element.textContent = "—";
    return;
  }

  const ratio =
    denominator > 0
      ? Math.round((numerator / denominator) * 100)
      : 0;

  element.textContent =
    `${Math.min(ratio, 100)}%`;
}

function getAnalyticsRangeConfig() {
  const selected =
    analyticsElements.range?.value ||
    "30";

  if (selected === "all") {
    return {
      since: null,
      label:
        typeof window.t === "function"
          ? window.t("analytics.allTime", "All time")
          : "All time"
    };
  }

  const days =
    Number(selected) || 30;

  return {
    since:
      new Date(
        Date.now() -
        days * 24 * 60 * 60 * 1000
      ).toISOString(),
    label:
      (
        typeof window.t === "function"
          ? window.t(
              `analytics.last${days}`,
              `Last ${days} days`
            )
          : `Last ${days} days`
      )
  };
}

async function loadAnalyticsRows(sinceDate = null) {
  const baseQuery = selectFields => {
    let query =
      supabaseClient
        .from("analytics_events")
        .select(selectFields)
        .order("created_at", {
          ascending: false
        })
        .limit(10000);

    if (sinceDate) {
      query =
        query.gte(
          "created_at",
          sinceDate
        );
    }

    return query;
  };

  let { data, error } =
    await baseQuery(
      "event_name, event_type, anonymous_id, session_id, user_id, event_id, page, source, metadata, created_at"
    );

  if (
    error &&
    (
      String(error.message || "").toLowerCase().includes("event_type") ||
      String(error.message || "").toLowerCase().includes("anonymous_id") ||
      String(error.message || "").toLowerCase().includes("metadata") ||
      String(error.message || "").toLowerCase().includes("page") ||
      String(error.message || "").toLowerCase().includes("source")
    )
  ) {
    const fallback =
      await baseQuery(
        "event_name, session_id, user_id, event_id, created_at"
      );

    data =
      fallback.data;
    error =
      fallback.error;
  }

  if (error) {
    console.warn(
      "Could not load analytics activity.",
      error.message
    );

    return {
      rows: null,
      error
    };
  }

  return {
    rows: data || [],
    error: null
  };
}

async function loadAnalyticsFeedbackRows(sinceDate = null) {
  let query =
    supabaseClient
      .from("user_feedback")
      .select("id, rating, category, summary, page, product_area, status, user_id, session_id, created_at")
      .order("created_at", {
        ascending: false
      })
      .limit(1000);

  if (sinceDate) {
    query =
      query.gte(
        "created_at",
        sinceDate
      );
  }

  const { data, error } =
    await query;

  if (error) {
    console.warn(
      "Could not load feedback analytics.",
      error.message
    );

    return [];
  }

  return data || [];
}

function getAnalyticsRowType(row) {
  return normalizeAnalyticsEventName(
    row.event_type ||
    row.event_name ||
    "unknown"
  );
}

function getAnalyticsRowMetadata(row) {
  return (
    row.metadata &&
    typeof row.metadata === "object"
      ? row.metadata
      : {}
  );
}

function createAnalyticsIdentityResolver(rows) {
  const sessionToUser =
    new Map();

  const anonymousToUser =
    new Map();

  rows.forEach(row => {
    if (!row.user_id) {
      return;
    }

    if (row.session_id) {
      sessionToUser.set(
        row.session_id,
        row.user_id
      );
    }

    if (row.anonymous_id) {
      anonymousToUser.set(
        row.anonymous_id,
        row.user_id
      );
    }
  });

  return {
    getActorId(row) {
      if (row.user_id) {
        return `user:${row.user_id}`;
      }

      if (
        row.session_id &&
        sessionToUser.has(row.session_id)
      ) {
        return `user:${sessionToUser.get(row.session_id)}`;
      }

      if (
        row.anonymous_id &&
        anonymousToUser.has(row.anonymous_id)
      ) {
        return `user:${anonymousToUser.get(row.anonymous_id)}`;
      }

      if (row.anonymous_id) {
        return `anon:${row.anonymous_id}`;
      }

      // Legacy rows without user_id or anonymous_id cannot be tied to a real
      // person safely. They still count as sessions/actions, not active users.
      return null;
    },
    hasKnownActor(row) {
      return Boolean(this.getActorId(row));
    }
  };
}

function getAnalyticsActorId(row, index, resolver = null) {
  if (resolver) {
    const resolvedActor =
      resolver.getActorId(row);

    if (resolvedActor) {
      return resolvedActor;
    }
  }

  if (row.user_id) {
    return `user:${row.user_id}`;
  }

  if (row.anonymous_id) {
    return `anon:${row.anonymous_id}`;
  }

  return null;
}

function getAnalyticsRowSessionId(row, index) {
  return (
    row.session_id ||
    getAnalyticsActorId(row, index)
  );
}

function formatAnalyticsEventId(value) {
  const eventId =
    String(value || "").trim();

  if (!eventId) {
    return "Unknown event";
  }

  return (
    eventId.split("|")[0] ||
    eventId
  );
}

function aggregateAnalyticsRows(rows) {
  const actionCounts = {};
  const sessionsByEvent =
    new Map();
  const allSessions =
    new Set();
  const planningSessions =
    new Set();
  const openedEvents = {};
  const plannedEvents = {};

  rows.forEach((row, index) => {
    const eventName =
      row.event_name || "unknown";

    const session =
      getAnalyticsRowSessionId(
        row,
        index
      );

    actionCounts[eventName] =
      (actionCounts[eventName] || 0) + 1;

    allSessions.add(session);

    if (!sessionsByEvent.has(eventName)) {
      sessionsByEvent.set(
        eventName,
        new Set()
      );
    }

    sessionsByEvent
      .get(eventName)
      .add(session);

    if (
      [
        "favorite_added",
        "season_distance_selected",
        "calendar_exported"
      ].includes(eventName)
    ) {
      planningSessions.add(session);
    }

    if (
      eventName === "event_opened" &&
      row.event_id
    ) {
      openedEvents[row.event_id] =
        (openedEvents[row.event_id] || 0) + 1;
    }

    if (
      [
        "favorite_added",
        "season_distance_selected",
        "calendar_exported"
      ].includes(eventName) &&
      row.event_id
    ) {
      plannedEvents[row.event_id] =
        (plannedEvents[row.event_id] || 0) + 1;
    }
  });

  const countOverlap =
    (source, target) => {
      if (!source?.size) {
        return {
          numerator: 0,
          denominator: 0
        };
      }

      return {
        numerator:
          [...source]
            .filter(session =>
              target?.has(session)
            )
            .length,
        denominator:
          source.size
      };
    };

  const searchSessions =
    sessionsByEvent.get("search_used") ||
    new Set();

  const openSessions =
    sessionsByEvent.get("event_opened") ||
    new Set();

  const favoriteSessions =
    sessionsByEvent.get("favorite_added") ||
    new Set();

  const exportSessions =
    sessionsByEvent.get("calendar_exported") ||
    new Set();

  return {
    actionCounts,
    allSessions,
    planningSessions,
    openedEvents,
    plannedEvents,
    funnel: {
      searchToOpen:
        countOverlap(
          searchSessions,
          openSessions
        ),
      openToFavorite:
        countOverlap(
          openSessions,
          favoriteSessions
        ),
      planningToExport:
        countOverlap(
          planningSessions,
          exportSessions
        )
    }
  };
}

function renderAnalyticsRanking(
  container,
  counts,
  actionLabel
) {
  if (!container) {
    return;
  }

  const rows =
    Object.entries(counts)
      .sort(
        (first, second) =>
          second[1] - first[1]
      )
      .slice(0, 8);

  const maximum =
    rows[0]?.[1] || 1;

  container.innerHTML =
    rows.length
      ? rows.map(
        ([eventId, count], index) => `
          <div class="analytics-ranking-item">
            <span class="analytics-ranking-position">${index + 1}</span>
            <div class="analytics-ranking-content">
              <div>
                <strong>${escapeAdminHTML(formatAnalyticsEventId(eventId))}</strong>
                <span>${count} ${escapeAdminHTML(actionLabel)}</span>
              </div>
              <span class="analytics-ranking-track">
                <span style="--analytics-width: ${Math.round((count / maximum) * 100)}%"></span>
              </span>
            </div>
          </div>
        `
      ).join("")
      : `<p class="admin-import-empty">No matching activity in this period.</p>`;
}

function renderAnalyticsActivity(actionCounts) {
  if (!analyticsElements.activityBreakdown) {
    return;
  }

  const actions = [
    [
      "search_used",
      typeof window.t === "function"
        ? window.t("analytics.searches", "Searches")
        : "Searches"
    ],
    [
      "event_opened",
      typeof window.t === "function"
        ? window.t("analytics.opens", "Event opens")
        : "Event opens"
    ],
    [
      "favorite_added",
      typeof window.t === "function"
        ? window.t("analytics.favorites", "Favorites")
        : "Favorites"
    ],
    [
      "season_distance_selected",
      typeof window.t === "function"
        ? window.t("analytics.distances", "Distance selections")
        : "Distance selections"
    ],
    [
      "calendar_exported",
      typeof window.t === "function"
        ? window.t("analytics.exports", "Calendar exports")
        : "Calendar exports"
    ],
    [
      "event_submitted",
      typeof window.t === "function"
        ? window.t("analytics.submissions", "Submissions")
        : "Submissions"
    ]
  ];

  const maximum =
    Math.max(
      1,
      ...actions.map(([key]) =>
        actionCounts[key] || 0
      )
    );

  analyticsElements.activityBreakdown
    .innerHTML =
      actions.map(([key, label]) => {
        const count =
          actionCounts[key] || 0;

        return `
          <div class="analytics-activity-row">
            <div>
              <span>${escapeAdminHTML(label)}</span>
              <strong>${count}</strong>
            </div>
            <span class="analytics-activity-track">
              <span
                class="analytics-activity-fill analytics-activity-${escapeAdminHTML(key)}"
                style="--analytics-width: ${Math.round((count / maximum) * 100)}%"
              ></span>
            </span>
          </div>
        `;
      }).join("");
}

function getAnalyticsRowsSince(rows, days) {
  const since =
    Date.now() -
    days * 24 * 60 * 60 * 1000;

  return rows.filter(row => {
    const timestamp =
      Date.parse(row.created_at || "");

    return (
      Number.isFinite(timestamp) &&
      timestamp >= since
    );
  });
}

function countAnalyticsRows(rows, eventTypes) {
  const wanted =
    new Set(
      eventTypes.map(type =>
        normalizeAnalyticsEventName(type)
      )
    );

  return rows.filter(row =>
    wanted.has(getAnalyticsRowType(row))
  ).length;
}

function getUniqueAnalyticsActors(rows, resolver = null) {
  return new Set(
    rows
      .map((row, index) =>
        getAnalyticsActorId(
          row,
          index,
          resolver
        )
      )
      .filter(Boolean)
  );
}

function getUniqueAnalyticsSessions(rows) {
  return new Set(
    rows.map((row, index) =>
      getAnalyticsRowSessionId(row, index)
    )
  );
}

function getReturningAnalyticsUsers(rows, resolver = null) {
  const actors =
    new Map();

  rows.forEach((row, index) => {
    const actor =
      getAnalyticsActorId(
        row,
        index,
        resolver
      );

    if (!actor) {
      return;
    }

    if (!actors.has(actor)) {
      actors.set(actor, {
        sessions: new Set(),
        days: new Set()
      });
    }

    const bucket =
      actors.get(actor);

    bucket.sessions.add(
      getAnalyticsRowSessionId(row, index)
    );

    const date =
      new Date(row.created_at || "");

    if (!Number.isNaN(date.getTime())) {
      bucket.days.add(
        date.toISOString().slice(0, 10)
      );
    }
  });

  return [...actors.values()]
    .filter(actor =>
      actor.sessions.size >= 2 ||
      actor.days.size >= 2
    ).length;
}

function countAnalyticsBy(rows, mapper) {
  const counts = {};

  rows.forEach((row, index) => {
    const key =
      mapper(row, index);

    if (!key) {
      return;
    }

    counts[key] =
      (counts[key] || 0) + 1;
  });

  return counts;
}

function analyticsPercent(numerator, denominator) {
  if (!denominator) {
    return "0%";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}

function analyticsDecimal(value) {
  return Number.isFinite(value)
    ? value.toFixed(1).replace(".0", "")
    : "0";
}

function renderAnalyticsList(
  container,
  counts,
  options = {}
) {
  if (!container) {
    return;
  }

  const rows =
    Array.isArray(counts)
      ? counts
      : Object.entries(counts || {})
          .sort((first, second) =>
            second[1] - first[1]
          );

  const visibleRows =
    rows
      .filter(row => row[0])
      .slice(0, options.limit || 6);

  if (!visibleRows.length) {
    container.innerHTML =
      `<p class="admin-import-empty">${escapeAdminHTML(options.empty || "No data in this period.")}</p>`;
    return;
  }

  const maximum =
    Math.max(
      1,
      ...visibleRows.map(row =>
        Number(row[1]) || 0
      )
    );

  container.innerHTML =
    visibleRows.map(([label, count]) => `
      <div class="analytics-table-row">
        <span>${escapeAdminHTML(formatAnalyticsEventId(label))}</span>
        <strong>${escapeAdminHTML(count)}</strong>
        <em style="--analytics-width: ${Math.round(((Number(count) || 0) / maximum) * 100)}%"></em>
      </div>
    `).join("");
}

function renderAnalyticsFeedbackList(container, rows) {
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML =
      `<p class="admin-import-empty">No feedback in this period.</p>`;
    return;
  }

  container.innerHTML =
    rows.slice(0, 5).map(row => `
      <div class="analytics-feedback-row">
        <strong>${escapeAdminHTML(row.summary || "Feedback")}</strong>
        <span>${escapeAdminHTML(row.category || "other")} · ${escapeAdminHTML(row.status || "new")}</span>
      </div>
    `).join("");
}

function getAnalyticsEventLabel(row) {
  const metadata =
    getAnalyticsRowMetadata(row);

  return (
    metadata.event_name ||
    metadata.event ||
    row.event_id ||
    "Unknown event"
  );
}

function getAnalyticsSearchTerm(row) {
  const metadata =
    getAnalyticsRowMetadata(row);

  return String(metadata.query || "")
    .trim()
    .toLowerCase();
}

function getAnalyticsFilterLabels(row) {
  const metadata =
    getAnalyticsRowMetadata(row);

  const labels = [];

  if (metadata.filter_type) {
    labels.push(
      `${metadata.filter_type}${metadata.value ? `: ${metadata.value}` : ""}`
    );
  }

  if (
    metadata.active_filters &&
    typeof metadata.active_filters === "object"
  ) {
    Object.entries(metadata.active_filters)
      .forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value
            .filter(Boolean)
            .forEach(item =>
              labels.push(`${key}: ${item}`)
            );
          return;
        }

        if (value) {
          labels.push(`${key}: ${value}`);
        }
      });
  }

  return labels;
}

async function updateAdminFeedback(
  id,
  card,
  options = {}
) {
  const isAdmin =
    await isCurrentUserAdmin();

  if (!isAdmin) {
    showAppMessage(
      "Admin access required",
      "Only administrators can update feedback."
    );
    return;
  }

  const saveButton =
    options.button ||
    card.querySelector("[data-feedback-save]");

  const status =
    options.status ||
    card.querySelector("[data-feedback-status]")
      ?.value ||
    "new";

  const internalNotes =
    card.querySelector("[data-feedback-notes]")
      ?.value.trim() || null;

  setButtonLoading(
    saveButton,
    true,
    "Saving..."
  );

  const { error } =
    await supabaseClient
      .from("user_feedback")
      .update({
        status,
        internal_notes: internalNotes
      })
      .eq("id", id);

  setButtonLoading(
    saveButton,
    false
  );

  if (error) {
    console.error(
      "Feedback review update failed:",
      error
    );
    showAppMessage(
      "Feedback update failed",
      getFriendlyErrorMessage(
        error,
        "The review status could not be updated."
      )
    );
    return;
  }

  showAppMessage(
    "Feedback updated",
    options.completed
      ? "The review is complete and has been removed from the active list."
      : "The internal review status was saved."
  );

  if (options.completed) {
    card.classList.add(
      "is-completed"
    );

    await new Promise(resolve =>
      window.setTimeout(
        resolve,
        180
      )
    );
  }

  await loadAdminFeedbackManagement();
}

async function loadAdminFeedbackStatusCounts() {
  const {
    data,
    error
  } = await supabaseClient
    .from("user_feedback")
    .select("status")
    .limit(2000);

  if (error) {
    [
      adminFeedbackElements.newCount,
      adminFeedbackElements.plannedCount,
      adminFeedbackElements.resolvedCount,
      adminFeedbackTabCount
    ]
      .filter(Boolean)
      .forEach(element => {
        element.textContent = "—";
      });

    return {
      available: false,
      total: 0
    };
  }

  const rows =
    data || [];

  const count =
    status =>
      rows.filter(row =>
        row.status === status
      ).length;

  const newCount =
    count("new");

  if (adminFeedbackElements.newCount) {
    adminFeedbackElements.newCount.textContent =
      newCount;
  }

  if (adminFeedbackElements.plannedCount) {
    adminFeedbackElements.plannedCount.textContent =
      count("planned");
  }

  if (adminFeedbackElements.resolvedCount) {
    adminFeedbackElements.resolvedCount.textContent =
      count("resolved");
  }

  if (adminFeedbackTabCount) {
    adminFeedbackTabCount.textContent =
      newCount +
      count("reviewed") +
      count("planned");
  }

  return {
    available: true,
    total: rows.length
  };
}

async function loadAdminFeedbackManagement() {
  const list =
    adminFeedbackElements.list;

  if (!list) {
    return;
  }

  list.innerHTML =
    `<p class="admin-import-empty">Loading feedback...</p>`;

  if (adminFeedbackElements.summary) {
    adminFeedbackElements.summary.textContent =
      "Loading feedback...";
  }

  const statusSummaryPromise =
    loadAdminFeedbackStatusCounts();

  let query =
    supabaseClient
      .from("user_feedback")
      .select(
        "id, rating, category, summary, message, page, product_area, event_id, screenshot_hint, status, internal_notes, user_id, created_at"
      )
      .order("created_at", {
        ascending: false
      })
      .limit(100);

  const category =
    adminFeedbackElements.category?.value || "";

  const status =
    adminFeedbackElements.status?.value || "";

  const area =
    adminFeedbackElements.area?.value || "";

  const dateDays =
    Number(adminFeedbackElements.date?.value || 0);

  if (category) {
    query =
      query.eq("category", category);
  }

  if (status) {
    query =
      status === "active"
        ? query.in(
            "status",
            [
              "new",
              "reviewed",
              "planned"
            ]
          )
        : query.eq(
            "status",
            status
          );
  }

  if (area) {
    query =
      query.eq("product_area", area);
  }

  if (dateDays) {
    query =
      query.gte(
        "created_at",
        new Date(
          Date.now() -
          dateDays * 24 * 60 * 60 * 1000
        ).toISOString()
      );
  }

  const { data, error } =
    await query;

  const statusSummary =
    await statusSummaryPromise;

  if (error) {
    console.warn(
      "Could not load feedback management list:",
      error.message
    );
    list.innerHTML =
      `<p class="admin-import-empty">Feedback review requires the closed-beta Supabase migration.</p>`;

    if (adminFeedbackElements.summary) {
      adminFeedbackElements.summary.textContent =
        "Feedback is unavailable until the migration and admin policies are active.";
    }

    return;
  }

  if (!(data || []).length) {
    list.innerHTML =
      `<p class="admin-import-empty">No feedback matches these filters.</p>`;

    if (adminFeedbackElements.summary) {
      adminFeedbackElements.summary.textContent =
        statusSummary.available
          ? `Showing 0 of ${statusSummary.total} feedback entries.`
          : "No feedback matches these filters.";
    }

    return;
  }

  if (adminFeedbackElements.summary) {
    adminFeedbackElements.summary.textContent =
      `Showing ${data.length} of ${statusSummary.total || data.length} feedback entries.`;
  }

  list.innerHTML =
    data.map(row => `
      <article class="admin-feedback-card" data-feedback-id="${escapeAdminHTML(row.id)}" data-feedback-state="${escapeAdminHTML(row.status || "new")}">
        <div class="admin-feedback-card-header">
          <div>
            <span>${escapeAdminHTML(row.category || "other")} · ${escapeAdminHTML(row.product_area || row.page || "unknown")}</span>
            <strong>${escapeAdminHTML(row.summary || "Beta feedback")}</strong>
          </div>
          <div class="admin-feedback-card-state">
            <span>${escapeAdminHTML(row.status || "new")}</span>
            <time>${escapeAdminHTML(new Date(row.created_at).toLocaleString())}</time>
          </div>
        </div>
        <p>${escapeAdminHTML(row.message || "No additional details.")}</p>
        <div class="admin-feedback-meta">
          <span>Rating: ${escapeAdminHTML(row.rating || "-")}/5</span>
          <span>Event: ${escapeAdminHTML(row.event_id || "-")}</span>
          <span>Author: ${row.user_id ? "Signed-in tester" : "Anonymous tester"}</span>
          <span>Screenshot: ${escapeAdminHTML(row.screenshot_hint || "-")}</span>
        </div>
        <div class="admin-feedback-review-controls">
          <label>
            Status
            <select data-feedback-status>
              ${["new", "reviewed", "planned", "resolved", "rejected"]
                .map(value => `
                  <option value="${value}" ${row.status === value ? "selected" : ""}>
                    ${value}
                  </option>
                `)
                .join("")}
            </select>
          </label>
          <label>
            Internal notes
            <textarea data-feedback-notes rows="2" maxlength="1000">${escapeAdminHTML(row.internal_notes || "")}</textarea>
          </label>
          <button type="button" data-feedback-save>
            Save review
          </button>
          ${["resolved", "rejected"].includes(row.status)
            ? ""
            : `
              <button type="button" class="complete-feedback-review-btn" data-feedback-complete>
                Complete review
              </button>
            `}
        </div>
      </article>
    `).join("");

  list
    .querySelectorAll("[data-feedback-id]")
    .forEach(card => {
      card
        .querySelector("[data-feedback-save]")
        ?.addEventListener("click", () => {
          updateAdminFeedback(
            card.dataset.feedbackId,
            card
          );
        });

      card
        .querySelector("[data-feedback-complete]")
        ?.addEventListener("click", event => {
          updateAdminFeedback(
            card.dataset.feedbackId,
            card,
            {
              status: "resolved",
              completed: true,
              button: event.currentTarget
            }
          );
        });
    });
}

async function loadAdminAnalytics() {
  if (adminAnalyticsStatus) {
    adminAnalyticsStatus.textContent =
      "Loading analytics...";
  }

  setButtonLoading(
    analyticsElements.refresh,
    true,
    "Refreshing..."
  );

  const range =
    getAnalyticsRangeConfig();

  if (analyticsElements.rangeLabel) {
    analyticsElements.rangeLabel.textContent =
      range.label;
  }

  const [
    analyticsResult,
    registeredUsers,
    feedbackRows
  ] = await Promise.all([
    loadAnalyticsRows(null),
    getTableCount("profiles"),
    loadAnalyticsFeedbackRows(range.since)
  ]);

  const allRows =
    analyticsResult.rows || [];

  const rows =
    range.since
      ? allRows.filter(row => {
          const timestamp =
            Date.parse(row.created_at || "");

          return (
            Number.isFinite(timestamp) &&
            timestamp >= Date.parse(range.since)
          );
        })
      : allRows;

  if (!analyticsResult.rows) {
    Object.values(analyticsElements)
      .filter(element =>
        element &&
        element.tagName &&
        element.tagName !== "SELECT" &&
        element.tagName !== "BUTTON"
      )
      .forEach(element => {
        if ("textContent" in element) {
          element.textContent = "—";
        }
      });

    if (adminAnalyticsStatus) {
      adminAnalyticsStatus.textContent =
        "Analytics could not be loaded.";
    }

    setButtonLoading(
      analyticsElements.refresh,
      false
    );
    return;
  }

  setAnalyticsNumber(
    analyticsElements.totalAccounts,
    registeredUsers
  );

  const identityResolver =
    createAnalyticsIdentityResolver(allRows);

  const rows7d =
    getAnalyticsRowsSince(allRows, 7);

  const rows30d =
    getAnalyticsRowsSince(allRows, 30);

  const activeUsers7d =
    getUniqueAnalyticsActors(
      rows7d,
      identityResolver
    ).size;

  const activeUsers30d =
    getUniqueAnalyticsActors(
      rows30d,
      identityResolver
    ).size;

  const returningUsers7d =
    getReturningAnalyticsUsers(
      rows7d,
      identityResolver
    );

  const returningUsers30d =
    getReturningAnalyticsUsers(
      rows30d,
      identityResolver
    );

  const periodUsers =
    getUniqueAnalyticsActors(
      rows,
      identityResolver
    );

  const periodSessions =
    getUniqueAnalyticsSessions(rows);

  const unidentifiedLegacySessions =
    new Set(
      rows
        .filter(row =>
          !identityResolver.hasKnownActor(row)
        )
        .map((row, index) =>
          getAnalyticsRowSessionId(row, index)
        )
        .filter(Boolean)
    ).size;

  const searchRows =
    rows.filter(row =>
      getAnalyticsRowType(row) === "search_performed"
    );

  const eventOpenRows =
    rows.filter(row =>
      getAnalyticsRowType(row) === "event_detail_opened"
    );

  const favoriteRows =
    rows.filter(row =>
      getAnalyticsRowType(row) === "favorite_added"
    );

  const plannerOpenRows =
    rows.filter(row =>
      getAnalyticsRowType(row) === "season_planner_opened"
    );

  const plannerAddRows =
    rows.filter(row =>
      getAnalyticsRowType(row) === "planner_event_added"
    );

  const recommendationRows =
    rows.filter(row =>
      getAnalyticsRowType(row) === "recommendation_clicked"
    );

  const externalRows =
    rows.filter(row =>
      getAnalyticsRowType(row) === "external_event_website_clicked"
    );

  const plannerUsers =
    getUniqueAnalyticsActors(
      [
        ...plannerOpenRows,
        ...plannerAddRows
      ],
      identityResolver
    );

  setAnalyticsNumber(
    analyticsElements.activeUsers7d,
    activeUsers7d
  );
  setAnalyticsNumber(
    analyticsElements.activeUsers30d,
    activeUsers30d
  );
  setAnalyticsNumber(
    analyticsElements.returningUsers7d,
    returningUsers7d
  );
  setAnalyticsNumber(
    analyticsElements.returningUsers30d,
    returningUsers30d
  );
  setAnalyticsNumber(
    analyticsElements.totalSessions,
    periodSessions.size
  );
  setAnalyticsNumber(
    analyticsElements.searchesKpi,
    searchRows.length
  );
  setAnalyticsNumber(
    analyticsElements.favoritesAddedKpi,
    favoriteRows.length
  );
  setAnalyticsNumber(
    analyticsElements.plannerUsersKpi,
    plannerUsers.size
  );
  setAnalyticsNumber(
    analyticsElements.plannerEventsAddedKpi,
    plannerAddRows.length
  );
  setAnalyticsNumber(
    analyticsElements.feedbackSubmissionsKpi,
    feedbackRows.length ||
      countAnalyticsRows(rows, ["feedback_submitted"])
  );

  const newUsers =
    Math.max(
      0,
      periodUsers.size -
      getReturningAnalyticsUsers(
        rows,
        identityResolver
      )
    );

  if (analyticsElements.newReturningSplit) {
    analyticsElements.newReturningSplit.textContent =
      `${newUsers} new / ${getReturningAnalyticsUsers(rows, identityResolver)} returning`;
  }

  if (analyticsElements.avgSessionsPerUser) {
    analyticsElements.avgSessionsPerUser.textContent =
      analyticsDecimal(
        periodUsers.size
          ? periodSessions.size / periodUsers.size
          : 0
      );
  }

  const actorVisitCounts = {};

  rows.forEach((row, index) => {
    const actor =
      getAnalyticsActorId(
        row,
        index,
        identityResolver
      );

    if (!actor) {
      return;
    }

    if (!actorVisitCounts[actor]) {
      actorVisitCounts[actor] =
        new Set();
    }

    actorVisitCounts[actor].add(
      getAnalyticsRowSessionId(row, index)
    );
  });

  const visitCount =
    minimum =>
      Object.values(actorVisitCounts)
        .filter(set => set.size >= minimum)
        .length;

  setAnalyticsNumber(
    analyticsElements.users2Visits,
    visitCount(2)
  );
  setAnalyticsNumber(
    analyticsElements.users3Visits,
    visitCount(3)
  );
  setAnalyticsNumber(
    analyticsElements.users5Visits,
    visitCount(5)
  );

  renderAnalyticsList(
    analyticsElements.retentionTable,
    [
      ["Active users", periodUsers.size],
      ["Returning users", getReturningAnalyticsUsers(rows, identityResolver)],
      ["Total sessions", periodSessions.size],
      ["Unidentified legacy sessions", unidentifiedLegacySessions],
      ["Tracked actions", rows.length]
    ],
    {
      empty: "No visitor activity in this period."
    }
  );

  const searchTerms =
    countAnalyticsBy(searchRows, getAnalyticsSearchTerm);

  const zeroResultSearches =
    searchRows.filter(row =>
      Number(getAnalyticsRowMetadata(row).results_count) === 0
    ).length;

  const filterCounts = {};

  rows
    .filter(row =>
      ["filter_changed", "sort_changed", "search_performed"]
        .includes(getAnalyticsRowType(row))
    )
    .forEach(row => {
      getAnalyticsFilterLabels(row)
        .forEach(label => {
          filterCounts[label] =
            (filterCounts[label] || 0) + 1;
        });
    });

  const searchSessions =
    new Set(
      searchRows.map((row, index) =>
        getAnalyticsRowSessionId(row, index)
      )
    );

  const openSessions =
    new Set(
      eventOpenRows.map((row, index) =>
        getAnalyticsRowSessionId(row, index)
      )
    );

  const searchOpenSessions =
    [...searchSessions]
      .filter(session =>
        openSessions.has(session)
      ).length;

  setAnalyticsNumber(
    analyticsElements.totalSearches,
    searchRows.length
  );

  if (analyticsElements.searchesPerUser) {
    analyticsElements.searchesPerUser.textContent =
      analyticsDecimal(
        periodUsers.size
          ? searchRows.length / periodUsers.size
          : 0
      );
  }

  setAnalyticsNumber(
    analyticsElements.zeroResultSearches,
    zeroResultSearches
  );

  if (analyticsElements.searchClickRate) {
    analyticsElements.searchClickRate.textContent =
      analyticsPercent(
        searchOpenSessions,
        searchSessions.size
      );
  }

  renderAnalyticsList(
    analyticsElements.topSearchTerms,
    searchTerms,
    {
      empty: "No search terms tracked yet."
    }
  );

  renderAnalyticsList(
    analyticsElements.mostUsedFilters,
    filterCounts,
    {
      empty: "No filter usage tracked yet."
    }
  );

  const openedEventCounts =
    countAnalyticsBy(
      eventOpenRows,
      getAnalyticsEventLabel
    );

  const favoriteEventCounts =
    countAnalyticsBy(
      favoriteRows,
      getAnalyticsEventLabel
    );

  const externalEventCounts =
    countAnalyticsBy(
      externalRows,
      getAnalyticsEventLabel
    );

  setAnalyticsNumber(
    analyticsElements.eventDetailOpens,
    eventOpenRows.length
  );

  if (analyticsElements.favoriteConversionRate) {
    analyticsElements.favoriteConversionRate.textContent =
      analyticsPercent(
        favoriteRows.length,
        eventOpenRows.length
      );
  }

  renderAnalyticsList(
    analyticsElements.mostViewedEvents,
    openedEventCounts,
    {
      empty: "No event detail opens yet."
    }
  );

  renderAnalyticsList(
    analyticsElements.mostFavoritedEvents,
    favoriteEventCounts,
    {
      empty: "No favorites added in this period."
    }
  );

  renderAnalyticsList(
    analyticsElements.mostExternalClicks,
    externalEventCounts,
    {
      empty: "No official website clicks yet."
    }
  );

  setAnalyticsNumber(
    analyticsElements.plannerOpens,
    plannerOpenRows.length
  );
  setAnalyticsNumber(
    analyticsElements.plannerUsers,
    plannerUsers.size
  );
  setAnalyticsNumber(
    analyticsElements.plannerEventsAdded,
    plannerAddRows.length
  );

  if (analyticsElements.avgPlannedEvents) {
    analyticsElements.avgPlannedEvents.textContent =
      analyticsDecimal(
        plannerUsers.size
          ? plannerAddRows.length / plannerUsers.size
          : 0
      );
  }

  setAnalyticsNumber(
    analyticsElements.recommendationClicks,
    recommendationRows.length
  );

  const plannerOpenUsers =
    getUniqueAnalyticsActors(
      plannerOpenRows,
      identityResolver
    ).size;

  if (analyticsElements.plannerConversionRate) {
    analyticsElements.plannerConversionRate.textContent =
      analyticsPercent(
        getUniqueAnalyticsActors(
          plannerAddRows,
          identityResolver
        ).size,
        plannerOpenUsers
      );
  }

  renderAnalyticsList(
    analyticsElements.priorityMix,
    countAnalyticsBy(
      rows.filter(row =>
        getAnalyticsRowType(row) === "planner_priority_changed"
      ),
      row =>
        getAnalyticsRowMetadata(row).priority || "Unspecified"
    ),
    {
      empty: "No priority changes tracked yet."
    }
  );

  renderAnalyticsList(
    analyticsElements.mostPlannedEvents,
    countAnalyticsBy(
      plannerAddRows,
      getAnalyticsEventLabel
    ),
    {
      empty: "No planner additions yet."
    }
  );

  setAnalyticsNumber(
    analyticsElements.feedbackTotal,
    feedbackRows.length
  );

  setAnalyticsNumber(
    analyticsElements.feedbackNew,
    feedbackRows.filter(row =>
      row.status === "new"
    ).length
  );

  const ratingCounts =
    countAnalyticsBy(
      feedbackRows,
      row =>
        row.rating
          ? `${row.rating}/5`
          : ""
    );

  if (analyticsElements.feedbackByRating) {
    const ratingText =
      Object.entries(ratingCounts)
        .sort((first, second) =>
          Number(second[0][0]) - Number(first[0][0])
        )
        .map(([rating, count]) =>
          `${rating}: ${count}`
        )
        .join(" · ");

    analyticsElements.feedbackByRating.textContent =
      ratingText || "-";
  }

  renderAnalyticsList(
    analyticsElements.feedbackByCategory,
    countAnalyticsBy(
      feedbackRows,
      row => row.category || "other"
    ),
    {
      empty: "No feedback categories yet."
    }
  );

  renderAnalyticsFeedbackList(
    analyticsElements.latestFeedback,
    feedbackRows
  );

  if (analyticsElements.retentionInsight) {
    analyticsElements.retentionInsight.textContent =
      `${returningUsers30d} returning users in the last 30 days.`;
  }

  if (analyticsElements.discoveryInsight) {
    analyticsElements.discoveryInsight.textContent =
      `${searchRows.length} searches, ${eventOpenRows.length} event detail opens, ${analyticsPercent(searchOpenSessions, searchSessions.size)} search-to-open rate.`;
  }

  if (analyticsElements.planningInsight) {
    analyticsElements.planningInsight.textContent =
      `${plannerUsers.size} planner users and ${plannerAddRows.length} races added to seasons.`;
  }

  if (adminAnalyticsStatus) {
    adminAnalyticsStatus.textContent =
      allRows.length >= 10000
        ? `${range.label}. Showing the latest 10,000 tracked actions.`
        : `${range.label}. Analytics are up to date.`;
  }

  setButtonLoading(
    analyticsElements.refresh,
    false
  );
}


function isUrlNeedingReview(url) {
  const value =
    String(url || "").toLowerCase();

  if (!value) {
    return true;
  }

  try {
    const parsed =
      new URL(value);

    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) {
      return true;
    }
  } catch (_error) {
    return true;
  }

  return [
    "marathon.de",
    "ahotu",
    "runsignup",
    "worldtriathlon",
    "worldsmarathons",
    "racecheck",
    "finishers.com",
    "laufrennen.de"
  ].some(domain =>
    value.includes(domain)
  );
}


function isDescriptionMissingStats(description) {
  const value =
    String(description || "").toLowerCase();

  return !(
    value.includes("participants:") ||
    value.includes("course:") ||
    value.includes("highlight:")
  );
}

function isStatusNeedingReview(event) {
  const status =
    String(event.verification_status || "")
      .toLowerCase();

  const note =
    String(event.source_note || "")
      .toLowerCase();

  return (
    !status ||
    status === "confirmed" ||
    status === "unclear" ||
    status === "date_expected" ||
    note.includes("registration status should be refreshed")
  );
}


function isDateNeedingConfirmation(event) {
  const status =
    String(event.verification_status || "")
      .toLowerCase();

  const note =
    String(event.source_note || "")
      .toLowerCase();

  return (
    status === "date_expected" ||
    note.includes("date needs") ||
    note.includes("date was not found") ||
    note.includes("needs a new official date")
  );
}


function isCoordinatePrecisionNeeded(event) {
  const lat =
    parseFloat(event.latitude);

  const lng =
    parseFloat(event.longitude);

  const address =
    String(event.address || "")
      .toLowerCase();

  const city =
    String(event.city || "")
      .toLowerCase();

  const country =
    String(event.country || "")
      .toLowerCase();

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return true;
  }

  return (
    !address ||
    address === `${city}, ${country}` ||
    !/\d/.test(address)
  );
}


function renderAdminQualityList(container, rows, emptyText) {
  if (!container) {
    return;
  }

  if (!rows.length) {
    container.innerHTML =
      `<p class="admin-quality-empty">${escapeAdminHTML(emptyText)}</p>`;
    return;
  }

  container.innerHTML =
    rows
      .slice(0, 8)
      .map(event => `
        <div class="admin-quality-item">
          <strong>${escapeAdminHTML(event.event_name)}</strong>
          <span>${escapeAdminHTML(event.date)} · ${escapeAdminHTML(event.city)}, ${escapeAdminHTML(event.country)}</span>
          <a href="${safeAdminUrl(event.event_url)}" target="_blank" rel="noopener noreferrer">Official page</a>
        </div>
      `)
      .join("");
}

function normalizeQualityReviewName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /\b(generali|bmw|datev|mainova|tcs|nn|adac|sparkasse)\b/g,
      " "
    )
    .replace(
      /\b(5k|10k|half|halbmarathon|marathon|kilometer|km)\b/g,
      " "
    )
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQualityDistanceCategories(value) {
  const distance =
    String(value || "")
      .toLowerCase()
      .replace(",", ".");

  const categories =
    new Set();

  if (/half|halbmarathon|21\.?1/.test(distance)) {
    categories.add("half");
  } else if (/marathon|42\.?195/.test(distance)) {
    categories.add("marathon");
  }

  if (/70\.3|middle|mitteldistanz/.test(distance)) {
    categories.add("tri-middle");
  }

  if (
    /ironman|full distance|langdistanz/.test(distance) &&
    !/70\.3/.test(distance)
  ) {
    categories.add("tri-full");
  }

  if (/ultra|50\s*km|100\s*(km|mile)|backyard/.test(distance)) {
    categories.add("ultra");
  }

  return categories;
}

function hasDifferentQualityDistances(first, second) {
  const firstCategories =
    getQualityDistanceCategories(first.distance);

  const secondCategories =
    getQualityDistanceCategories(second.distance);

  if (!firstCategories.size || !secondCategories.size) {
    return false;
  }

  return ![...firstCategories].some(category =>
    secondCategories.has(category)
  );
}

function getPossibleDuplicateKeys(rows) {
  const groups =
    rows.reduce((map, event) => {
      const key = [
        String(event.date || "").trim(),
        String(event.city || "").trim().toLowerCase()
      ].join("|");

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key).push(event);
      return map;
    }, new Map());

  const duplicates =
    new Set();

  groups.forEach(group => {
    for (
      let firstIndex = 0;
      firstIndex < group.length;
      firstIndex += 1
    ) {
      const firstName =
        normalizeQualityReviewName(
          group[firstIndex].event_name
        );

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < group.length;
        secondIndex += 1
      ) {
        const secondName =
          normalizeQualityReviewName(
            group[secondIndex].event_name
          );

        const similar =
          firstName &&
          secondName &&
          !hasDifferentQualityDistances(
            group[firstIndex],
            group[secondIndex]
          ) &&
          (
            firstName === secondName ||
            firstName.includes(secondName) ||
            secondName.includes(firstName)
          );

        if (similar) {
          duplicates.add(
            createEventKey(group[firstIndex])
          );
          duplicates.add(
            createEventKey(group[secondIndex])
          );
        }
      }
    }
  });

  return duplicates;
}

function getQualityReviewIssue(event, duplicateKeys) {
  if (isDateNeedingConfirmation(event)) {
    return {
      rank: 1,
      label: "Date confirmation",
      detail: "Missing, expected or unconfirmed event date."
    };
  }

  if (isUrlNeedingReview(event.event_url)) {
    return {
      rank: 2,
      label: "Official website",
      detail: "Missing or non-official event website."
    };
  }

  const checkedValue =
    String(event.last_checked || "").trim();

  const checkedMatch =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(
      checkedValue
    );

  const lastChecked =
    checkedMatch
      ? new Date(
          Number(checkedMatch[3]),
          Number(checkedMatch[2]) - 1,
          Number(checkedMatch[1])
        ).getTime()
      : Date.parse(checkedValue);

  if (
    !Number.isFinite(lastChecked) ||
    Date.now() - lastChecked >
      90 * 24 * 60 * 60 * 1000
  ) {
    return {
      rank: 3,
      label: "Stale review",
      detail: "Not checked within the last 90 days."
    };
  }

  if (isCoordinatePrecisionNeeded(event)) {
    return {
      rank: 4,
      label: "Coordinates",
      detail: "Coordinates or venue precision need review."
    };
  }

  if (
    duplicateKeys.has(
      createEventKey(event)
    )
  ) {
    return {
      rank: 5,
      label: "Possible duplicate",
      detail: "Similar event name, date and city."
    };
  }

  if (isStatusNeedingReview(event)) {
    return {
      rank: 6,
      label: "Registration status",
      detail: "Registration status is unclear or outdated."
    };
  }

  return null;
}

function renderQualityPriorityQueue(rows) {
  if (!qualityPriorityReviewList) {
    return;
  }

  const duplicateKeys =
    getPossibleDuplicateKeys(rows);

  let reviewRows =
    rows
      .map(event => ({
        event,
        issue:
          getQualityReviewIssue(
            event,
            duplicateKeys
          )
      }))
      .filter(item => item.issue);

  const sort =
    qualityReviewSort?.value || "priority";

  reviewRows.sort((first, second) => {
    if (sort === "name") {
      return String(first.event.event_name || "")
        .localeCompare(
          String(second.event.event_name || "")
        );
    }

    if (sort === "date") {
      const parseDate =
        value => {
          const match =
            /^(\d{2})\.(\d{2})\.(\d{4})$/
              .exec(String(value || ""));

          return match
            ? new Date(
                Number(match[3]),
                Number(match[2]) - 1,
                Number(match[1])
              ).getTime()
            : Number.MAX_SAFE_INTEGER;
        };

      return (
        parseDate(first.event.date) -
        parseDate(second.event.date)
      );
    }

    return (
      first.issue.rank -
      second.issue.rank
    );
  });

  qualityPriorityReviewList.innerHTML =
    reviewRows.length
      ? reviewRows
        .slice(0, 30)
        .map(({ event, issue }) => `
          <article class="admin-quality-priority-item">
            <span>${issue.rank}</span>
            <div>
              <strong>${escapeAdminHTML(issue.label)} · ${escapeAdminHTML(event.event_name)}</strong>
              <p>${escapeAdminHTML(issue.detail)} ${escapeAdminHTML(event.date)} · ${escapeAdminHTML(event.city)}, ${escapeAdminHTML(event.country)}</p>
            </div>
            <a href="${safeAdminUrl(event.event_url)}" target="_blank" rel="noopener noreferrer">
              Review
            </a>
          </article>
        `)
        .join("")
      : `<p class="admin-quality-empty">No quality reviews are currently due.</p>`;

  if (qualityReviewCount) {
    qualityReviewCount.textContent =
      reviewRows.length;
  }

  if (adminQualityTabCount) {
    adminQualityTabCount.textContent =
      reviewRows.length;
  }
}

const ADMIN_QUALITY_GOAL =
  1000;

const ADMIN_QUALITY_STALE_DAYS =
  120;

const ADMIN_DUPLICATE_DECISIONS_KEY =
  "sportEventMap.adminDuplicateDecisions";

const ADMIN_QUALITY_REVIEW_DECISIONS_KEY =
  "sportEventMap.adminQualityReviewDecisions";

const ADMIN_OFFICIAL_SOURCE_PATTERN =
  /official|organizer|veranstalter|manual review|verified/i;

const ADMIN_COUNTRY_BOUNDS = {
  germany: { lat: [47, 55.3], lng: [5.5, 15.5] },
  deutschland: { lat: [47, 55.3], lng: [5.5, 15.5] },
  austria: { lat: [46, 49.2], lng: [9, 17.5] },
  switzerland: { lat: [45.7, 47.9], lng: [5.7, 10.7] },
  netherlands: { lat: [50.6, 53.8], lng: [3.2, 7.3] },
  belgium: { lat: [49.4, 51.7], lng: [2.4, 6.5] },
  france: { lat: [41, 51.5], lng: [-5.5, 10] },
  italy: { lat: [36, 47.2], lng: [6, 19] },
  spain: { lat: [35.5, 44], lng: [-10, 4.5] },
  portugal: { lat: [36.8, 42.4], lng: [-9.8, -6] },
  denmark: { lat: [54.4, 58], lng: [7.5, 15.5] },
  sweden: { lat: [55, 69.5], lng: [10, 24.5] },
  norway: { lat: [57.5, 71.5], lng: [4, 31.5] },
  finland: { lat: [59.5, 70.5], lng: [19, 32] },
  poland: { lat: [49, 55], lng: [14, 24.5] },
  czechia: { lat: [48.5, 51.2], lng: [12, 19] },
  "czech republic": { lat: [48.5, 51.2], lng: [12, 19] },
  ireland: { lat: [51, 55.6], lng: [-10.8, -5.2] },
  "united kingdom": { lat: [49.8, 60.9], lng: [-8.7, 2.1] },
  uk: { lat: [49.8, 60.9], lng: [-8.7, 2.1] },
  greece: { lat: [34, 42], lng: [19, 29.8] },
  turkey: { lat: [35, 42.5], lng: [25, 45] }
};

function parseAdminDate(value) {
  const text =
    String(value || "").trim();

  const germanMatch =
    /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);

  if (germanMatch) {
    return new Date(
      Number(germanMatch[3]),
      Number(germanMatch[2]) - 1,
      Number(germanMatch[1])
    );
  }

  const timestamp =
    Date.parse(text);

  return Number.isFinite(timestamp)
    ? new Date(timestamp)
    : null;
}

function isDateInPast(value) {
  const date =
    parseAdminDate(value);

  if (!date) {
    return false;
  }

  const today =
    new Date();

  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date < today;
}

function createEventKey(event) {
  return [
    normalizeQualityReviewName(event.event_name),
    String(event.date || "").trim(),
    String(event.city || "").trim().toLowerCase(),
    String(event.country || "").trim().toLowerCase()
  ].join("|");
}

function getAdminDuplicateDecisions() {
  try {
    return JSON.parse(
      localStorage.getItem(
        ADMIN_DUPLICATE_DECISIONS_KEY
      ) || "{}"
    );
  } catch (_error) {
    return {};
  }
}

function saveAdminDuplicateDecision(key, decision) {
  const decisions =
    getAdminDuplicateDecisions();

  decisions[key] = {
    decision,
    decided_at:
      new Date().toISOString()
  };

  localStorage.setItem(
    ADMIN_DUPLICATE_DECISIONS_KEY,
    JSON.stringify(decisions)
  );
}

function getAdminQualityReviewDecisions() {
  try {
    return JSON.parse(
      localStorage.getItem(
        ADMIN_QUALITY_REVIEW_DECISIONS_KEY
      ) || "{}"
    );
  } catch (_error) {
    return {};
  }
}

function saveAdminQualityReviewDecision(key, payload = {}) {
  const decisions =
    getAdminQualityReviewDecisions();

  decisions[key] = {
    ...(decisions[key] || {}),
    ...payload,
    updated_at:
      new Date().toISOString()
  };

  localStorage.setItem(
    ADMIN_QUALITY_REVIEW_DECISIONS_KEY,
    JSON.stringify(decisions)
  );

  return decisions[key];
}

function formatAdminDateForCsv(date = new Date()) {
  return [
    String(date.getDate()).padStart(2, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    date.getFullYear()
  ].join(".");
}

function getQualityDecisionForEvent(event) {
  return getAdminQualityReviewDecisions()[
    createEventKey(event)
  ] || null;
}

function applyQualityDecisionToEvent(event) {
  const decision =
    getQualityDecisionForEvent(event) ||
    event.__reviewDecision ||
    null;

  if (!decision) {
    return {
      ...event,
      __reviewDecision: null
    };
  }

  return {
    ...event,
    date:
      decision.new_date ||
      event.date,
    verification_status:
      decision.verification_status ||
      event.verification_status,
    registration_status:
      decision.registration_status ||
      event.registration_status,
    last_checked:
      decision.last_checked ||
      event.last_checked,
    source_note:
      decision.review_note
        ? `${event.source_note || ""} Admin review: ${decision.review_note}`.trim()
        : event.source_note,
    __reviewDecision:
      decision
  };
}

function getQualitySearchUrl(event) {
  const nextYear =
    new Date().getFullYear() + 1;

  const query = [
    event.event_name,
    event.city,
    event.country,
    nextYear,
    "date official"
  ]
    .filter(Boolean)
    .join(" ");

  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getQualityUpdatePayload(action, options = {}) {
  const today =
    formatAdminDateForCsv();

  const reviewNote =
    String(options.review_note || "").trim();

  if (action === "update_date") {
    return {
      review_status: "confirmed_valid",
      review_reason: "date_updated",
      verification_status: "registration_open",
      registration_status:
        options.registration_status ||
        "registration_open",
      new_date:
        options.new_date,
      last_checked:
        options.last_checked || today,
      review_note:
        reviewNote || "Date updated from official website."
    };
  }

  if (action === "date_expected") {
    return {
      review_status: "date_expected",
      review_reason: "date_expected",
      verification_status: "date_expected",
      registration_status: "date_expected",
      last_checked: today,
      review_note:
        reviewNote || "Official website checked, new date not announced yet."
    };
  }

  if (action === "archive") {
    return {
      review_status: "archived",
      review_reason: "archived",
      verification_status: "archived",
      registration_status: "cancelled",
      last_checked: today,
      review_note:
        reviewNote || "Archived during data quality review."
    };
  }

  if (action === "needs_review") {
    return {
      review_status: "needs_review",
      review_reason: "manual_review_required",
      last_checked: today,
      review_note:
        reviewNote || "Manual follow-up required."
    };
  }

  if (action === "approve" || action === "confirm_valid") {
    return {
      review_status: "confirmed_valid",
      review_reason: "manual_confirmation",
      verification_status: "registration_open",
      last_checked: today,
      review_note:
        reviewNote || "Official website checked, event is still valid."
    };
  }

  if (action === "last_checked") {
    return {
      review_status: "confirmed_valid",
      review_reason: "last_checked_updated",
      last_checked: today,
      review_note:
        reviewNote || "Last checked updated after admin review."
    };
  }

  return {
    review_status: action,
    review_reason: action,
    last_checked: today,
    review_note: reviewNote
  };
}

async function persistQualityReviewDecision(event, action, options = {}) {
  const eventKey =
    createEventKey(event);

  const payload =
    getQualityUpdatePayload(
      action,
      options
    );

  saveAdminQualityReviewDecision(
    eventKey,
    payload
  );

  if (event.id && typeof supabaseClient !== "undefined") {
    const dbPayload = {
      last_checked:
        new Date().toISOString(),
      needs_review:
        ![
          "approve",
          "confirm_valid",
          "update_date",
          "last_checked"
        ].includes(action),
      review_status:
        payload.review_status,
      review_note:
        payload.review_note || null,
      review_reason:
        payload.review_reason || action,
      updated_at:
        new Date().toISOString()
    };

    if (payload.new_date) {
      dbPayload.date =
        payload.new_date;
    }

    if (payload.registration_status) {
      dbPayload.registration_status =
        payload.registration_status;
    }

    if (payload.review_note) {
      dbPayload.status_note =
        payload.review_note;
    }

    if (action === "archive") {
      dbPayload.status =
        "archived";
    } else if (
      action === "approve" ||
      action === "confirm_valid" ||
      action === "update_date"
    ) {
      dbPayload.status =
        "approved";
    }

    let { error } =
      await supabaseClient
        .from("events")
        .update(dbPayload)
        .eq("id", event.id);

    if (
      error &&
      /review_status|review_note|review_reason|updated_at|events_status_check/i.test(
        String(error.message || "")
      )
    ) {
      const fallbackPayload = {
        ...dbPayload
      };

      delete fallbackPayload.review_status;
      delete fallbackPayload.review_note;
      delete fallbackPayload.review_reason;
      delete fallbackPayload.updated_at;

      if (
        fallbackPayload.status &&
        ![
          "pending",
          "approved",
          "rejected"
        ].includes(fallbackPayload.status)
      ) {
        fallbackPayload.status =
          action === "archive"
            ? "rejected"
            : "approved";
      }

      const fallback =
        await supabaseClient
          .from("events")
          .update(fallbackPayload)
          .eq("id", event.id);

      error =
        fallback.error;
    }

    if (error) {
      console.warn(
        "Quality review decision was saved locally, but the Supabase event could not be updated:",
        error.message
      );
    }
  }

  localQualityRows =
    localQualityRows.map(row =>
      createEventKey(row) === eventKey
        ? applyQualityDecisionToEvent({
            ...row,
            date:
              payload.new_date || row.date,
            verification_status:
              payload.verification_status ||
              row.verification_status,
            registration_status:
              payload.registration_status ||
              row.registration_status,
            last_checked:
              payload.last_checked ||
              row.last_checked
          })
        : row
    );

  renderLocalDataQualityDashboard(
    localQualityRows
  );
}

function getEventHostname(value) {
  try {
    return new URL(value)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
}

function isAggregatorAdminUrl(value) {
  const hostname =
    getEventHostname(value);

  return ADMIN_AGGREGATOR_DOMAINS.some(domain =>
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

function isOfficialSource(event) {
  const sourceText = [
    event.data_source,
    event.source_url,
    event.source_note,
    event.status_note
  ].join(" ");

  return (
    ADMIN_OFFICIAL_SOURCE_PATTERN.test(sourceText) ||
    (
      isOfficialAdminEventUrl(event.event_url) &&
      !isAggregatorAdminUrl(event.source_url || "")
    )
  );
}

function isCountryCoordinateMismatch(event) {
  if (!hasValidCoordinates(event)) {
    return false;
  }

  const bounds =
    ADMIN_COUNTRY_BOUNDS[
      String(event.country || "")
        .trim()
        .toLowerCase()
    ];

  if (!bounds) {
    return false;
  }

  const latitude =
    Number(event.latitude);

  const longitude =
    Number(event.longitude);

  return (
    latitude < bounds.lat[0] ||
    latitude > bounds.lat[1] ||
    longitude < bounds.lng[0] ||
    longitude > bounds.lng[1]
  );
}

function getLastCheckedAgeDays(event) {
  const date =
    parseAdminDate(event.last_checked);

  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor(
    (Date.now() - date.getTime()) /
    (24 * 60 * 60 * 1000)
  );
}

function getAdminStatus(event) {
  return String(
    event.verification_status ||
    event.registration_status ||
    event.status_label ||
    ""
  )
    .trim()
    .toLowerCase();
}

function getDuplicateGroups(rows) {
  const decisions =
    getAdminDuplicateDecisions();

  const groups =
    rows.reduce((map, event) => {
      const hostname =
        getEventHostname(event.event_url);

      const date =
        parseAdminDate(event.date);

      const dateBucket =
        date
          ? Math.round(date.getTime() / (3 * 24 * 60 * 60 * 1000))
          : "no-date";

      const keys = [
        [
          "site",
          hostname,
          String(event.city || "").trim().toLowerCase(),
          String(event.country || "").trim().toLowerCase()
        ].join("|"),
        [
          "fuzzy",
          normalizeQualityReviewName(event.event_name),
          String(event.city || "").trim().toLowerCase(),
          String(event.country || "").trim().toLowerCase(),
          dateBucket
        ].join("|")
      ];

      keys.forEach(key => {
        if (!key.includes("||") && key.length > 10) {
          if (!map.has(key)) {
            map.set(key, []);
          }

          map.get(key).push(event);
        }
      });

      return map;
    }, new Map());

  const duplicateMap =
    new Map();

  groups.forEach(group => {
    if (group.length < 2) {
      return;
    }

    group.forEach(event => {
      const key =
        createEventKey(event);

      if (
        decisions[key]?.decision === "not_duplicate" ||
        decisions[key]?.decision === "keep_both"
      ) {
        return;
      }

      const others =
        group.filter(candidate =>
          createEventKey(candidate) !== key
        );

      if (others.length) {
        duplicateMap.set(key, others);
      }
    });
  });

  return duplicateMap;
}

function getQualityReviewIssues(event, duplicateMap) {
  const issues = [];
  const reviewDecision =
    event.__reviewDecision || null;

  if (
    reviewDecision?.review_status === "archived" ||
    reviewDecision?.review_status === "rejected"
  ) {
    return [];
  }

  const addIssue =
    (key, label, detail, rank, penalty = 10) => {
      issues.push({
        key,
        label,
        detail,
        rank,
        penalty
      });
    };

  if (!isValidAdminEventUrl(event.event_url)) {
    addIssue(
      "missing_website",
      "Missing official website",
      "The event URL is missing or invalid.",
      1,
      18
    );
  } else if (!isOfficialAdminEventUrl(event.event_url)) {
    addIssue(
      "source_not_official",
      "Source not official",
      "The event URL points to an aggregator instead of the organizer.",
      2,
      16
    );
  }

  if (!String(event.date || "").trim()) {
    addIssue(
      "missing_date",
      "Missing date",
      "No event date or date expected marker is available.",
      3,
      16
    );
  } else if (
    isDateInPast(event.date) &&
    getAdminStatus(event) !== "date_expected"
  ) {
    addIssue(
      "date_outdated",
      "Date outdated",
      "The event date is in the past and no new date is marked as expected.",
      3,
      16
    );
  }

  if (
    getAdminStatus(event) === "date_expected"
  ) {
    if (
      reviewDecision?.review_status !== "date_expected"
    ) {
      addIssue(
        "date_expected",
        "Date expected but not confirmed",
        "The event needs a confirmed date before it is launch-ready.",
        4,
        8
      );
    }
  }

  if (
    !String(event.city || "").trim() ||
    !String(event.country || "").trim()
  ) {
    addIssue(
      "missing_location",
      "Missing city or country",
      "City and country are required for reliable filtering.",
      5,
      14
    );
  }

  if (!hasValidCoordinates(event)) {
    addIssue(
      "coordinates_missing",
      "Coordinates missing",
      "The event cannot be placed reliably on the map.",
      6,
      16
    );
  } else if (isCountryCoordinateMismatch(event)) {
    addIssue(
      "coordinates_suspicious",
      "Coordinates look suspicious",
      "Coordinates are outside the expected country bounds.",
      6,
      16
    );
  }

  if (!String(event.sport || "").trim()) {
    addIssue(
      "missing_sport",
      "Missing sport",
      "Sport is required for discovery filters.",
      7,
      12
    );
  }

  if (!String(event.distance || "").trim()) {
    addIssue(
      "missing_distance",
      "Missing distance",
      "Distance or distance category is required for athlete filtering.",
      8,
      12
    );
  }

  if (
    !getAdminStatus(event) ||
    getAdminStatus(event) === "unclear"
  ) {
    addIssue(
      "registration_unknown",
      "Registration status unknown",
      "Registration state should be checked on the official website.",
      9,
      8
    );
  }

  if (!isOfficialSource(event)) {
    addIssue(
      "source_not_confirmed",
      "Source not official",
      "No official/manual source marker is stored for this event.",
      10,
      10
    );
  }

  const lastCheckedAge =
    getLastCheckedAgeDays(event);

  if (
    !Number.isFinite(lastCheckedAge)
  ) {
    addIssue(
      "last_checked_missing",
      "Last checked missing",
      "The event has no review timestamp.",
      11,
      8
    );
  } else if (
    lastCheckedAge > ADMIN_QUALITY_STALE_DAYS
  ) {
    addIssue(
      "last_checked_stale",
      `Last checked older than ${ADMIN_QUALITY_STALE_DAYS} days`,
      "Refresh the official website before launch.",
      11,
      8
    );
  }

  const duplicateCandidates =
    duplicateMap.get(
      createEventKey(event)
    );

  if (duplicateCandidates?.length) {
    addIssue(
      "possible_duplicate",
      "Possible duplicate",
      `Similar to ${duplicateCandidates
        .slice(0, 2)
        .map(candidate => candidate.event_name)
        .join(", ")}.`,
      12,
      12
    );
  }

  const sourceText = [
    event.data_source,
    event.source_note
  ].join(" ").toLowerCase();

  if (
    sourceText.includes("import") &&
    !/manual review|verified|official/.test(sourceText)
  ) {
    addIssue(
      "never_manually_confirmed",
      "Imported but not manually confirmed",
      "Imported event needs one human review before launch.",
      13,
      8
    );
  }

  return issues.sort(
    (first, second) =>
      first.rank - second.rank
  );
}

function getQualityScore(issues) {
  const score =
    100 -
    issues.reduce(
      (sum, issue) =>
        sum + issue.penalty,
      0
    );

  return Math.max(0, score);
}

function getQualityAnalysisRows(rows) {
  const duplicateMap =
    getDuplicateGroups(rows);

  return rows.map(event => {
    const reviewedEvent =
      applyQualityDecisionToEvent(event);

    const issues =
      getQualityReviewIssues(
        reviewedEvent,
        duplicateMap
      );

    return {
      event:
        reviewedEvent,
      issues,
      score:
        getQualityScore(issues),
      duplicateCandidates:
        duplicateMap.get(
          createEventKey(reviewedEvent)
        ) || []
    };
  });
}

function getPrimaryQualityIssue(analysis) {
  return analysis.issues[0] || null;
}

function renderQualityBreakdown(container, rows, field) {
  if (!container) {
    return;
  }

  const counts =
    rows.reduce((map, event) => {
      const key =
        String(event[field] || "Unknown")
          .trim() ||
        "Unknown";

      map.set(
        key,
        (map.get(key) || 0) + 1
      );

      return map;
    }, new Map());

  const topRows =
    [...counts.entries()]
      .sort(
        (first, second) =>
          second[1] - first[1]
      )
      .slice(0, 8);

  const maximum =
    Math.max(
      1,
      ...topRows.map(([, count]) => count)
    );

  container.innerHTML =
    topRows.length
      ? topRows.map(([label, count]) => `
          <div class="admin-quality-breakdown-row">
            <span>${escapeAdminHTML(label)}</span>
            <strong>${count}</strong>
            <i style="--quality-width: ${Math.round((count / maximum) * 100)}%"></i>
          </div>
        `).join("")
      : `<p class="admin-quality-empty">No data available.</p>`;
}

function renderAdminQualityList(container, analysisRows, issueKey, emptyText) {
  if (!container) {
    return;
  }

  const issueKeys =
    Array.isArray(issueKey)
      ? issueKey
      : [issueKey];

  const rows =
    analysisRows
      .filter(row =>
        row.issues.some(issue =>
          issueKeys.includes(issue.key)
        )
      )
      .slice(0, 8);

  if (!rows.length) {
    container.innerHTML =
      `<p class="admin-quality-empty">${escapeAdminHTML(emptyText)}</p>`;
    return;
  }

  container.innerHTML =
    rows
      .map(({ event, issues, score }) => {
        const issue =
          issues.find(item =>
            issueKeys.includes(item.key)
          ) || issues[0];

        return `
          <div class="admin-quality-item">
            <strong>${escapeAdminHTML(event.event_name)}</strong>
            <span>${escapeAdminHTML(issue.label)} · Score ${score}</span>
            <small>${escapeAdminHTML(event.date || "-")} · ${escapeAdminHTML(event.city || "-")}, ${escapeAdminHTML(event.country || "-")}</small>
            <a href="${safeAdminUrl(event.event_url)}" target="_blank" rel="noopener noreferrer">Review official page</a>
          </div>
        `;
      })
      .join("");
}

function renderLocalDataQualityDashboard(rows = localQualityRows) {
  const analysisRows =
    getQualityAnalysisRows(rows);

  const rowsNeedingReview =
    analysisRows.filter(row =>
      row.issues.length
    );

  const countIssue =
    key =>
      analysisRows.filter(row =>
        row.issues.some(issue =>
          issue.key === key
        )
      ).length;

  const outdatedDates =
    countIssue("date_outdated") +
    countIssue("missing_date") +
    countIssue("date_expected");

  const needsUrlReview =
    countIssue("missing_website") +
    countIssue("source_not_official") +
    countIssue("source_not_confirmed");

  const missingCoordinates =
    countIssue("coordinates_missing") +
    countIssue("coordinates_suspicious");

  const possibleDuplicates =
    countIssue("possible_duplicate");

  const averageScore =
    rows.length
      ? Math.round(
          analysisRows.reduce(
            (sum, row) =>
              sum + row.score,
            0
          ) / rows.length
        )
      : 0;

  const goalProgress =
    Math.min(
      100,
      Math.round(
        (rows.length / ADMIN_QUALITY_GOAL) *
        100
      )
    );

  if (missingStatsCount) {
    missingStatsCount.textContent =
      outdatedDates;
  }

  if (urlReviewCount) {
    urlReviewCount.textContent =
      needsUrlReview;
  }

  if (activeApprovedEventsCount) {
    activeApprovedEventsCount.textContent =
      rows.length;
  }

  if (eventGoalProgressCount) {
    eventGoalProgressCount.textContent =
      `${goalProgress}%`;
  }

  if (eventGoalProgressLabel) {
    eventGoalProgressLabel.textContent =
      `${rows.length} of ${ADMIN_QUALITY_GOAL} launch-ready event slots`;
  }

  if (eventGoalProgressBar) {
    eventGoalProgressBar.style.setProperty(
      "--quality-goal-progress",
      `${goalProgress}%`
    );
  }

  if (possibleDuplicateCount) {
    possibleDuplicateCount.textContent =
      possibleDuplicates;
  }

  if (missingQualityCoordsCount) {
    missingQualityCoordsCount.textContent =
      missingCoordinates;
  }

  if (averageQualityScore) {
    averageQualityScore.textContent =
      `${averageScore}/100`;
  }

  if (qualityReviewCount) {
    qualityReviewCount.textContent =
      rowsNeedingReview.length;
  }

  if (adminQualityTabCount) {
    adminQualityTabCount.textContent =
      rowsNeedingReview.length;
  }

  renderQualityBreakdown(
    qualitySportBreakdown,
    rows,
    "sport"
  );

  renderQualityBreakdown(
    qualityCountryBreakdown,
    rows,
    "country"
  );

  renderAdminQualityList(
    statusReviewList,
    analysisRows,
    "registration_unknown",
    "No status checks needed."
  );

  renderAdminQualityList(
    dateReviewList,
    analysisRows,
    [
      "missing_date",
      "date_outdated",
      "date_expected"
    ],
    "No date confirmations needed."
  );

  renderAdminQualityList(
    coordinateReviewList,
    analysisRows,
    [
      "coordinates_missing",
      "coordinates_suspicious"
    ],
    "No coordinate precision tasks."
  );

  renderAdminQualityList(
    officialWebsiteReviewList,
    analysisRows,
    [
      "missing_website",
      "source_not_official",
      "source_not_confirmed"
    ],
    "No official website checks needed."
  );

  renderQualityPriorityQueue(rows);
}

function renderQualityPriorityQueue(rows) {
  if (!qualityPriorityReviewList) {
    return;
  }

  const analysisRows =
    getQualityAnalysisRows(rows);

  let reviewRows =
    analysisRows.filter(row =>
      row.issues.length
    );

  const sort =
    qualityReviewSort?.value || "priority";

  reviewRows.sort((first, second) => {
    if (sort === "score") {
      return first.score - second.score;
    }

    if (sort === "name") {
      return String(first.event.event_name || "")
        .localeCompare(
          String(second.event.event_name || "")
        );
    }

    if (sort === "date") {
      const firstDate =
        parseAdminDate(first.event.date);
      const secondDate =
        parseAdminDate(second.event.date);

      return (
        (firstDate?.getTime() || Number.MAX_SAFE_INTEGER) -
        (secondDate?.getTime() || Number.MAX_SAFE_INTEGER)
      );
    }

    return (
      getPrimaryQualityIssue(first).rank -
      getPrimaryQualityIssue(second).rank
    );
  });

  qualityPriorityReviewList.innerHTML =
    reviewRows.length
      ? reviewRows
        .slice(0, 35)
        .map(({ event, issues, score, duplicateCandidates }) => {
          const primaryIssue =
            issues[0];

          const eventKey =
            createEventKey(event);

          return `
            <article class="admin-quality-priority-item ${score >= 85 ? "is-low-risk" : score >= 65 ? "is-medium-risk" : "is-high-risk"}" data-quality-event-key="${escapeAdminHTML(eventKey)}">
              <label class="admin-quality-select">
                <input type="checkbox" data-quality-select />
                <span>${score}</span>
              </label>
              <div>
                <strong>${escapeAdminHTML(primaryIssue.label)} · ${escapeAdminHTML(event.event_name)}</strong>
                <p>${escapeAdminHTML(primaryIssue.detail)} ${escapeAdminHTML(event.date || "-")} · ${escapeAdminHTML(event.city || "-")}, ${escapeAdminHTML(event.country || "-")}</p>
                <div class="admin-quality-reasons">
                  ${issues.slice(0, 5).map(issue => `
                    <em>${escapeAdminHTML(issue.label)}</em>
                  `).join("")}
                </div>
                <div class="admin-quality-review-actions">
                  ${isOfficialAdminEventUrl(event.event_url)
                    ? `<a href="${safeAdminUrl(event.event_url)}" target="_blank" rel="noopener noreferrer">Open official website</a>`
                    : `<span>Missing official website</span>`}
                  <a href="${escapeAdminHTML(getQualitySearchUrl(event))}" target="_blank" rel="noopener noreferrer">Search new date</a>
                  <button type="button" data-quality-action="update_date">Update date</button>
                  <button type="button" data-quality-action="date_expected">Mark as date expected</button>
                  <button type="button" data-quality-action="confirm_valid">Confirm still valid</button>
                  <button type="button" data-quality-action="archive">Archive event</button>
                </div>
                <form class="admin-quality-date-form" data-quality-date-form hidden>
                  <label>
                    New date
                    <input type="text" data-quality-new-date placeholder="DD.MM.YYYY" value="${escapeAdminHTML(event.date || "")}" />
                  </label>
                  <label>
                    Registration status
                    <select data-quality-registration>
                      ${[
                        ["registration_open", "Registration open"],
                        ["registration_not_open", "Registration not open yet"],
                        ["sold_out", "Sold out"],
                        ["date_expected", "Date expected"],
                        ["cancelled", "Cancelled"],
                        ["confirmed", "Confirmed"],
                        ["unclear", "Unclear"]
                      ].map(([value, label]) => `
                        <option value="${value}" ${getAdminStatus(event) === value ? "selected" : ""}>${label}</option>
                      `).join("")}
                    </select>
                  </label>
                  <label class="admin-quality-note-field">
                    Review note
                    <textarea data-quality-review-note rows="2" placeholder="Example: 2027 date confirmed on official website.">${escapeAdminHTML(event.__reviewDecision?.review_note || "")}</textarea>
                  </label>
                  <div>
                    <button type="button" data-quality-save-date>Save update</button>
                    <button type="button" data-quality-cancel-date>Cancel</button>
                  </div>
                </form>
                ${duplicateCandidates.length
                  ? `
                    <div class="admin-duplicate-actions">
                      <button type="button" data-duplicate-action="keep_both">Keep both</button>
                      <button type="button" data-duplicate-action="not_duplicate">Mark as not duplicate</button>
                      <button type="button" data-duplicate-action="merge_update">Merge/update existing</button>
                      <button type="button" data-duplicate-action="replace_old">Replace old event</button>
                    </div>
                  `
                  : ""}
              </div>
              <a href="${safeAdminUrl(event.event_url)}" target="_blank" rel="noopener noreferrer">
                Review
              </a>
            </article>
          `;
        })
        .join("")
      : `<p class="admin-quality-empty">No quality reviews are currently due.</p>`;

  qualityPriorityReviewList
    .querySelectorAll("[data-quality-select]")
    .forEach(input => {
      input.addEventListener(
        "change",
        updateQualityBulkSelectionCount
      );
    });

  qualityPriorityReviewList
    .querySelectorAll("[data-quality-action]")
    .forEach(button => {
      button.addEventListener("click", async event => {
        const card =
          event.currentTarget.closest(
            "[data-quality-event-key]"
          );

        const reviewEvent =
          findQualityEventByKey(
            card?.dataset.qualityEventKey
          );

        if (!card || !reviewEvent) {
          return;
        }

        const action =
          event.currentTarget.dataset.qualityAction;

        if (action === "update_date") {
          card
            .querySelector("[data-quality-date-form]")
            ?.removeAttribute("hidden");
          return;
        }

        await persistQualityReviewDecision(
          reviewEvent,
          action
        );

        showAppMessage(
          "Review decision saved",
          "The event review state was updated. CSV data was not changed automatically."
        );
      });
    });

  qualityPriorityReviewList
    .querySelectorAll("[data-quality-save-date]")
    .forEach(button => {
      button.addEventListener("click", async event => {
        const card =
          event.currentTarget.closest(
            "[data-quality-event-key]"
          );

        const reviewEvent =
          findQualityEventByKey(
            card?.dataset.qualityEventKey
          );

        if (!card || !reviewEvent) {
          return;
        }

        const newDate =
          card.querySelector("[data-quality-new-date]")
            ?.value.trim() || "";

        if (!isGermanDateString(newDate)) {
          showAppMessage(
            "Invalid date",
            "Use the format DD.MM.YYYY."
          );
          return;
        }

        await persistQualityReviewDecision(
          reviewEvent,
          "update_date",
          {
            new_date: newDate,
            registration_status:
              card.querySelector("[data-quality-registration]")
                ?.value || "registration_open",
            review_note:
              card.querySelector("[data-quality-review-note]")
                ?.value || ""
          }
        );

        showAppMessage(
          "Event date updated",
          "The review queue now uses the new date. Update the CSV row before publishing this change permanently."
        );
      });
    });

  qualityPriorityReviewList
    .querySelectorAll("[data-quality-cancel-date]")
    .forEach(button => {
      button.addEventListener("click", event => {
        event.currentTarget
          .closest("[data-quality-date-form]")
          ?.setAttribute("hidden", "hidden");
      });
    });

  qualityPriorityReviewList
    .querySelectorAll("[data-duplicate-action]")
    .forEach(button => {
      button.addEventListener("click", event => {
        const card =
          event.currentTarget.closest(
            "[data-quality-event-key]"
          );

        if (!card) {
          return;
        }

        saveAdminDuplicateDecision(
          card.dataset.qualityEventKey,
          event.currentTarget.dataset.duplicateAction
        );

        showAppMessage(
          "Duplicate decision saved",
          "The local review queue was updated. CSV data was not changed automatically."
        );

        renderQualityPriorityQueue(
          localQualityRows
        );
      });
    });

  updateQualityBulkSelectionCount();

  if (qualityReviewCount) {
    qualityReviewCount.textContent =
      reviewRows.length;
  }

  if (adminQualityTabCount) {
    adminQualityTabCount.textContent =
      reviewRows.length;
  }
}

function findQualityEventByKey(key) {
  if (!key) {
    return null;
  }

  return localQualityRows.find(row =>
    createEventKey(row) === key ||
    createEventKey(
      applyQualityDecisionToEvent(row)
    ) === key
  ) || null;
}

function getSelectedQualityEvents() {
  if (!qualityPriorityReviewList) {
    return [];
  }

  return Array
    .from(
      qualityPriorityReviewList.querySelectorAll(
        "[data-quality-select]:checked"
      )
    )
    .map(input =>
      input.closest("[data-quality-event-key]")
        ?.dataset.qualityEventKey
    )
    .map(findQualityEventByKey)
    .filter(Boolean);
}

function updateQualityBulkSelectionCount() {
  if (!qualityBulkSelectionCount) {
    return;
  }

  const count =
    getSelectedQualityEvents().length;

  qualityBulkSelectionCount.textContent =
    `${count} selected`;
}

async function applyQualityBulkAction() {
  const action =
    qualityBulkAction?.value || "";

  const selected =
    getSelectedQualityEvents();

  if (!action) {
    showAppMessage(
      "Choose an action",
      "Select a bulk action before applying it."
    );
    return;
  }

  if (!selected.length) {
    showAppMessage(
      "No events selected",
      "Select one or more events in the quality queue."
    );
    return;
  }

  setButtonLoading(
    applyQualityBulkActionBtn,
    true,
    "Applying..."
  );

  for (const event of selected) {
    await persistQualityReviewDecision(
      event,
      action
    );
  }

  setButtonLoading(
    applyQualityBulkActionBtn,
    false
  );

  if (qualityBulkAction) {
    qualityBulkAction.value = "";
  }

  showAppMessage(
    "Bulk review updated",
    `${selected.length} event review decision${selected.length === 1 ? "" : "s"} saved.`
  );
}


async function loadLocalDataQualitySummary(options = {}) {
  if (
    !missingStatsCount &&
    !urlReviewCount &&
    !statusReviewList &&
    !dateReviewList &&
    !coordinateReviewList &&
    !officialWebsiteReviewList
  ) {
    return;
  }

  if (
    localQualityRows.length &&
    !options.force
  ) {
    renderLocalDataQualityDashboard(
      localQualityRows
    );
    return;
  }

  if (qualityPriorityReviewList) {
    qualityPriorityReviewList.innerHTML =
      `<p class="admin-quality-empty">Checking the curated CSV...</p>`;
  }

  try {
    const response =
      await fetch("data/events.csv");

    if (!response.ok) {
      throw new Error(
        `Event CSV request failed with ${response.status}`
      );
    }

    const csvText =
      await response.text();

    const parsed =
      Papa.parse(csvText, {
        header: true,
        delimiter: ";",
        skipEmptyLines: true
      });

    if (parsed.errors?.length) {
      console.warn(
        "CSV quality parser warnings:",
        parsed.errors
      );
    }

    const rows =
      parsed.data.filter(event =>
        event && event.event_name
      );

    localQualityRows =
      rows;

    renderLocalDataQualityDashboard(
      rows
    );

    return;

    const analysisRows =
      getQualityAnalysisRows(rows);

    const rowsNeedingReview =
      analysisRows.filter(row =>
        row.issues.length
      );

    const countIssue =
      key =>
        analysisRows.filter(row =>
          row.issues.some(issue =>
            issue.key === key
          )
        ).length;

    const outdatedDates =
      countIssue("date_outdated") +
      countIssue("missing_date") +
      countIssue("date_expected");

    const needsUrlReview =
      countIssue("missing_website") +
      countIssue("source_not_official") +
      countIssue("source_not_confirmed");

    const missingCoordinates =
      countIssue("coordinates_missing") +
      countIssue("coordinates_suspicious");

    const possibleDuplicates =
      countIssue("possible_duplicate");

    const averageScore =
      rows.length
        ? Math.round(
            analysisRows.reduce(
              (sum, row) =>
                sum + row.score,
              0
            ) / rows.length
          )
        : 0;

    const goalProgress =
      Math.min(
        100,
        Math.round(
          (rows.length / ADMIN_QUALITY_GOAL) *
          100
        )
      );

    if (missingStatsCount) {
      missingStatsCount.textContent =
        outdatedDates;
    }

    if (urlReviewCount) {
      urlReviewCount.textContent =
        needsUrlReview;
    }

    if (activeApprovedEventsCount) {
      activeApprovedEventsCount.textContent =
        rows.length;
    }

    if (eventGoalProgressCount) {
      eventGoalProgressCount.textContent =
        `${goalProgress}%`;
    }

    if (eventGoalProgressLabel) {
      eventGoalProgressLabel.textContent =
        `${rows.length} of ${ADMIN_QUALITY_GOAL} launch-ready event slots`;
    }

    if (eventGoalProgressBar) {
      eventGoalProgressBar.style.setProperty(
        "--quality-goal-progress",
        `${goalProgress}%`
      );
    }

    if (possibleDuplicateCount) {
      possibleDuplicateCount.textContent =
        possibleDuplicates;
    }

    if (missingQualityCoordsCount) {
      missingQualityCoordsCount.textContent =
        missingCoordinates;
    }

    if (averageQualityScore) {
      averageQualityScore.textContent =
        `${averageScore}/100`;
    }

    if (qualityReviewCount) {
      qualityReviewCount.textContent =
        rowsNeedingReview.length;
    }

    if (adminQualityTabCount) {
      adminQualityTabCount.textContent =
        rowsNeedingReview.length;
    }

    renderQualityBreakdown(
      qualitySportBreakdown,
      rows,
      "sport"
    );

    renderQualityBreakdown(
      qualityCountryBreakdown,
      rows,
      "country"
    );

    renderAdminQualityList(
      statusReviewList,
      analysisRows,
      "registration_unknown",
      "No status checks needed."
    );

    renderAdminQualityList(
      dateReviewList,
      analysisRows,
      [
        "missing_date",
        "date_outdated",
        "date_expected"
      ],
      "No date confirmations needed."
    );

    renderAdminQualityList(
      coordinateReviewList,
      analysisRows,
      [
        "coordinates_missing",
        "coordinates_suspicious"
      ],
      "No coordinate precision tasks."
    );

    renderAdminQualityList(
      officialWebsiteReviewList,
      analysisRows,
      [
        "missing_website",
        "source_not_official",
        "source_not_confirmed"
      ],
      "No official website checks needed."
    );

    renderQualityPriorityQueue(rows);
  }

  catch (error) {
    console.warn(
      "Could not load local data quality summary:",
      error
    );

    const errorMessage =
      `<p class="admin-quality-empty">The CSV quality review could not be loaded. Check data/events.csv and try again.</p>`;

    [
      qualityPriorityReviewList,
      statusReviewList,
      dateReviewList,
      coordinateReviewList,
      officialWebsiteReviewList
    ]
      .filter(Boolean)
      .forEach(container => {
        container.innerHTML =
          errorMessage;
      });

    if (qualityReviewCount) {
      qualityReviewCount.textContent =
        "—";
    }

    if (adminQualityTabCount) {
      adminQualityTabCount.textContent =
        "—";
    }
  }
}


function escapeAdminHTML(value) {

  return String(value || "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function safeAdminUrl(value) {

  try {
    const url =
      new URL(
        String(value || "").trim()
      );

    if (
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) {
      return escapeAdminHTML(
        url.href
      );
    }
  } catch (_error) {
    // Invalid URLs are intentionally replaced with a non-navigating link.
  }

  return "#";

}


function isValidAdminEventUrl(value) {
  try {
    const url =
      new URL(
        String(value || "").trim()
      );

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch (_error) {
    return false;
  }
}

const ADMIN_AGGREGATOR_DOMAINS = [
  "ahotu.com",
  "finishers.com",
  "laufrennen.de",
  "marathon.de",
  "racecheck.com",
  "runsignup.com",
  "worldsmarathons.com"
];

function isOfficialAdminEventUrl(value) {
  if (!isValidAdminEventUrl(value)) {
    return false;
  }

  const hostname =
    new URL(value)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");

  return !ADMIN_AGGREGATOR_DOMAINS.some(domain =>
    hostname === domain ||
    hostname.endsWith(`.${domain}`)
  );
}

function getPendingEventIssues(event) {
  const issues = [];

  if (!String(event.event_name || "").trim()) {
    issues.push({
      key: "name",
      label: "Missing name",
      blocking: true
    });
  }

  if (!String(event.sport || "").trim()) {
    issues.push({
      key: "sport",
      label: "Missing sport",
      blocking: true
    });
  }

  if (!String(event.date || "").trim()) {
    issues.push({
      key: "date",
      label: "Missing date",
      blocking: true
    });
  } else if (!isGermanDateString(event.date)) {
    issues.push({
      key: "date",
      label: "Invalid date format",
      blocking: true
    });
  }

  if (
    !String(event.city || "").trim() ||
    !String(event.country || "").trim()
  ) {
    issues.push({
      key: "location",
      label: "Missing location",
      blocking: true
    });
  }

  if (!String(event.distance || "").trim()) {
    issues.push({
      key: "distance",
      label: "Missing distance",
      blocking: true
    });
  }

  if (!isOfficialAdminEventUrl(event.event_url)) {
    issues.push({
      key: "website",
      label: isValidAdminEventUrl(event.event_url)
        ? "Official website required"
        : "Invalid website",
      blocking: true
    });
  }

  if (
    !event.registration_status ||
    event.registration_status === "unclear"
  ) {
    issues.push({
      key: "registration",
      label: "Registration status unclear",
      blocking: false
    });
  }

  if (
    event.source_type &&
    event.source_type !== "official"
  ) {
    issues.push({
      key: "source",
      label: "Source not official",
      blocking: true
    });
  }

  if (!hasValidCoordinates(event)) {
    issues.push({
      key: "coordinates",
      label: "Geocode on approval",
      blocking: false
    });
  }

  return issues;
}

function getBlockingPendingIssues(event) {
  return getPendingEventIssues(event)
    .filter(issue =>
      issue.blocking
    );
}

function getPendingEventReadiness(event) {
  const issues =
    getPendingEventIssues(event);

  const blockingIssues =
    issues.filter(issue =>
      issue.blocking
    );

  return {
    issues,
    blockingIssues,
    canApprove:
      blockingIssues.length === 0
  };
}

function updatePendingBulkSelectionCount() {
  if (!pendingBulkSelectionCount) {
    return;
  }

  const selected =
    getSelectedPendingEvents();

  const ready =
    selected.filter(event =>
      getPendingEventReadiness(event).canApprove
    );

  pendingBulkSelectionCount.textContent =
    `${selected.length} selected · ${ready.length} ready`;
}

function getSelectedPendingEvents() {
  return Array
    .from(
      document.querySelectorAll(
        "[data-pending-select]:checked"
      )
    )
    .map(input =>
      pendingAdminEvents.find(event =>
        String(event.id) ===
        String(input.value)
      )
    )
    .filter(Boolean);
}

async function approvePendingBatch(mode) {
  const sourceRows =
    mode === "selected"
      ? getSelectedPendingEvents()
      : getVisiblePendingEvents()
        .map(row => row.event);

  const readyRows =
    sourceRows.filter(event =>
      getPendingEventReadiness(event).canApprove
    );

  if (!sourceRows.length) {
    showAppMessage(
      "No events selected",
      mode === "selected"
        ? "Select one or more events first."
        : "No visible review events are available."
    );
    return;
  }

  if (!readyRows.length) {
    showAppMessage(
      "Nothing ready to approve",
      "Fix blocking review issues before approving these events."
    );
    return;
  }

  const blockedCount =
    sourceRows.length - readyRows.length;

  const confirmed =
    window.confirm(
      `Approve ${readyRows.length} ready event${readyRows.length === 1 ? "" : "s"}${blockedCount ? ` and leave ${blockedCount} blocked event${blockedCount === 1 ? "" : "s"} in review` : ""}?`
    );

  if (!confirmed) {
    return;
  }

  const button =
    mode === "selected"
      ? approveSelectedPendingBtn
      : approveVisibleReadyBtn;

  setButtonLoading(
    button,
    true,
    "Approving..."
  );

  let approved = 0;
  let failed = 0;

  for (const event of readyRows) {
    await approveEvent(
      event.id,
      event
    );

    const stillPending =
      pendingAdminEvents.some(item =>
        String(item.id) ===
        String(event.id)
      );

    if (stillPending) {
      failed += 1;
    } else {
      approved += 1;
    }
  }

  setButtonLoading(
    button,
    false
  );

  updatePendingBulkSelectionCount();

  showAppMessage(
    "Batch approval complete",
    `${approved} approved${failed ? `, ${failed} still need attention` : ""}.`
  );
}

function updatePendingBatchFilterOptions() {
  if (!pendingBatchFilter) {
    return;
  }

  const currentValue =
    pendingBatchFilter.value || "all";

  const batches =
    [...new Set(
      pendingAdminEvents
        .map(event =>
          String(event.import_batch || "").trim()
        )
        .filter(Boolean)
    )]
      .sort((first, second) =>
        first.localeCompare(second)
      );

  pendingBatchFilter.innerHTML = `
    <option value="all">All batches</option>
    ${batches.map(batch => `
      <option value="${escapeAdminHTML(batch)}">
        ${escapeAdminHTML(batch)}
      </option>
    `).join("")}
  `;

  pendingBatchFilter.value =
    batches.includes(currentValue)
      ? currentValue
      : "all";
}

function getVisiblePendingEvents() {
  const query =
    String(pendingEventSearch?.value || "")
      .trim()
      .toLowerCase();

  const filter =
    pendingEventFilter?.value || "all";

  const sort =
    pendingEventSort?.value || "oldest";

  const batch =
    pendingBatchFilter?.value || "all";

  const rows =
    pendingAdminEvents
      .map(event => ({
        event,
        issues:
          getPendingEventIssues(event)
      }))
      .filter(({ event, issues }) => {
        if (query) {
          const haystack = [
            event.event_name,
            event.city,
            event.country,
            event.sport,
            event.distance
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(query)) {
            return false;
          }
        }

        if (
          batch !== "all" &&
          String(event.import_batch || "") !== batch
        ) {
          return false;
        }

        if (filter === "ready") {
          return !issues.some(issue =>
            issue.blocking
          );
        }

        if (filter === "issues") {
          return issues.length > 0;
        }

        if (
          [
            "coordinates",
            "website",
            "date",
            "registration",
            "source"
          ]
            .includes(filter)
        ) {
          return issues.some(issue =>
            issue.key === filter
          );
        }

        return true;
      });

  const getCreatedTime =
    event => {
      const timestamp =
        Date.parse(event.created_at || "");

      return Number.isFinite(timestamp)
        ? timestamp
        : 0;
    };

  rows.sort((first, second) => {
    if (sort === "newest") {
      return (
        getCreatedTime(second.event) -
        getCreatedTime(first.event)
      );
    }

    if (sort === "issues") {
      return (
        second.issues.length -
        first.issues.length
      );
    }

    if (sort === "name") {
      return String(first.event.event_name || "")
        .localeCompare(
          String(second.event.event_name || "")
        );
    }

    return (
      getCreatedTime(first.event) -
      getCreatedTime(second.event)
    );
  });

  return rows;
}

function renderPendingEvents() {
  const list =
    document.getElementById(
      "pendingEventsList"
    );

  if (!list) {
    return;
  }

  const rows =
    getVisiblePendingEvents();

  if (pendingEventsSummary) {
    pendingEventsSummary.textContent =
      `Showing ${rows.length} of ${pendingAdminEvents.length} pending submissions.`;
  }

  if (pendingCount) {
    pendingCount.textContent =
      pendingAdminEvents.length;
  }

  if (adminPendingTabCount) {
    adminPendingTabCount.textContent =
      pendingAdminEvents.length;
  }

  if (!pendingAdminEvents.length) {
    list.innerHTML = `
      <div class="admin-empty-state">
        <strong>No pending events</strong>
        <span>New user submissions will appear here automatically.</span>
      </div>
    `;
    return;
  }

  if (!rows.length) {
    list.innerHTML = `
      <div class="admin-empty-state">
        <strong>No matching submissions</strong>
        <span>Change the search or readiness filter.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = `
    <div class="admin-pending-grid">
      ${rows.map(({ event, issues }) => {
        const validUrl =
          isOfficialAdminEventUrl(
            event.event_url
          );
        const {
          blockingIssues,
          canApprove
        } = getPendingEventReadiness(event);
        const readinessLabel =
          !canApprove
            ? `${blockingIssues.length} blocker${blockingIssues.length === 1 ? "" : "s"}`
            : issues.length
              ? "Ready with checks"
              : "Ready";

        const createdAt =
          event.created_at &&
          Number.isFinite(
            Date.parse(event.created_at)
          )
            ? new Date(
                event.created_at
              ).toLocaleString()
            : "-";

        return `
          <article
            class="pending-card ${blockingIssues.length ? "needs-attention" : "is-ready"}"
            data-event-id="${escapeAdminHTML(event.id)}"
          >
            <div class="pending-card-header">
              <label class="pending-card-select" title="Select for bulk approval">
                <input
                  type="checkbox"
                  data-pending-select
                  value="${escapeAdminHTML(event.id)}"
                  ${canApprove ? "" : "aria-label=\"Select event with blockers\""}
                />
                <span></span>
              </label>
              <div>
                <div class="pending-card-title-line">
                  <h4>${escapeAdminHTML(event.event_name || "Untitled event")}</h4>
                  <span class="pending-readiness ${canApprove ? "is-ready" : "has-issues"}">
                    ${readinessLabel}
                  </span>
                </div>
                <p>${escapeAdminHTML(event.city || "-")}, ${escapeAdminHTML(event.country || "-")}</p>
              </div>
              <span class="pending-sport-label">${escapeAdminHTML(event.sport || "Event")}</span>
            </div>

            ${issues.length
              ? `
                <div class="pending-issues">
                  ${issues.map(issue => `
                    <span>${escapeAdminHTML(issue.label)}</span>
                  `).join("")}
                </div>
              `
              : ""}

            <div class="pending-card-details">
              <div>
                <span>Date</span>
                <strong>${escapeAdminHTML(event.date || "-")}</strong>
              </div>
              <div>
                <span>Distance</span>
                <strong>${escapeAdminHTML(event.distance || "-")}</strong>
              </div>
              <div>
                <span>Address</span>
                <strong>${escapeAdminHTML(event.address || "-")}</strong>
              </div>
              <div>
                <span>Coordinates</span>
                <strong>
                  ${hasValidCoordinates(event)
                    ? `${escapeAdminHTML(event.latitude)}, ${escapeAdminHTML(event.longitude)}`
                    : "Geocode on approval"}
                </strong>
              </div>
              <div>
                <span>Submitted</span>
                <strong>${escapeAdminHTML(createdAt)}</strong>
              </div>
              <div>
                <span>Registration</span>
                <strong>${escapeAdminHTML(event.registration_status || "unclear")}</strong>
              </div>
              <div>
                <span>Review priority</span>
                <strong>${escapeAdminHTML(event.review_priority || "medium")}</strong>
              </div>
              <div>
                <span>Import batch</span>
                <strong>${escapeAdminHTML(event.import_batch || "manual / no batch")}</strong>
              </div>
              <div>
                <span>Source type</span>
                <strong>${escapeAdminHTML(event.source_type || "unknown")}</strong>
              </div>
              <div>
                <span>Review status</span>
                <strong>${escapeAdminHTML(event.review_status || event.status || "pending")}</strong>
              </div>
            </div>

            <details class="pending-card-description">
              <summary>Description</summary>
              <p>${escapeAdminHTML(event.description || "No description provided.")}</p>
              ${
                event.review_reason ||
                event.review_note ||
                event.status_note
                  ? `
                    <div class="pending-admin-notes">
                      <strong>Internal review</strong>
                      <span>${escapeAdminHTML(event.review_reason || "review")}</span>
                      <p>${escapeAdminHTML(event.review_note || event.status_note || "")}</p>
                    </div>
                  `
                  : ""
              }
            </details>

            <div class="pending-card-editor" hidden>
              <div class="pending-editor-grid">
                <label>
                  Event name
                  <input data-pending-field="event_name" value="${escapeAdminHTML(event.event_name || "")}" />
                </label>
                <label>
                  Sport
                  <input data-pending-field="sport" value="${escapeAdminHTML(event.sport || "")}" />
                </label>
                <label>
                  Date
                  <input data-pending-field="date" value="${escapeAdminHTML(event.date || "")}" placeholder="DD.MM.YYYY" />
                </label>
                <label>
                  Distance
                  <input data-pending-field="distance" value="${escapeAdminHTML(event.distance || "")}" />
                </label>
                <label>
                  Registration status
                  <select data-pending-field="registration_status">
                    ${[
                      ["unclear", "Status unclear"],
                      ["registration_open", "Registration open"],
                      ["registration_not_open", "Registration not open yet"],
                      ["sold_out", "Sold out"],
                      ["cancelled", "Cancelled"],
                      ["date_expected", "Date expected"],
                      ["confirmed", "Confirmed"]
                    ].map(([value, label]) => `
                      <option value="${value}" ${String(event.registration_status || "unclear") === value ? "selected" : ""}>
                        ${label}
                      </option>
                    `).join("")}
                  </select>
                </label>
                <label>
                  Review priority
                  <select data-pending-field="review_priority">
                    ${["high", "medium", "low"].map(value => `
                      <option value="${value}" ${String(event.review_priority || "medium") === value ? "selected" : ""}>
                        ${value}
                      </option>
                    `).join("")}
                  </select>
                </label>
                <label>
                  Source type
                  <select data-pending-field="source_type">
                    ${["official", "unknown"].map(value => `
                      <option value="${value}" ${String(event.source_type || "unknown") === value ? "selected" : ""}>
                        ${value}
                      </option>
                    `).join("")}
                  </select>
                </label>
                <label>
                  Review status
                  <select data-pending-field="review_status">
                    ${["pending", "needs_review", "date_expected", "approved", "rejected", "archived", "duplicate", "confirmed_valid"].map(value => `
                      <option value="${value}" ${String(event.review_status || event.status || "pending") === value ? "selected" : ""}>
                        ${value}
                      </option>
                    `).join("")}
                  </select>
                </label>
                <label>
                  Import batch
                  <input data-pending-field="import_batch" value="${escapeAdminHTML(event.import_batch || "")}" placeholder="germany-road-running-batch-01" />
                </label>
                <label>
                  City
                  <input data-pending-field="city" value="${escapeAdminHTML(event.city || "")}" />
                </label>
                <label>
                  Country
                  <input data-pending-field="country" value="${escapeAdminHTML(event.country || "")}" />
                </label>
                <label class="pending-editor-wide">
                  Address
                  <input data-pending-field="address" value="${escapeAdminHTML(event.address || "")}" />
                </label>
                <label class="pending-editor-wide">
                  Official website
                  <input data-pending-field="event_url" type="url" value="${escapeAdminHTML(event.event_url || "")}" />
                </label>
                <label>
                  Latitude
                  <input data-pending-field="latitude" inputmode="decimal" value="${escapeAdminHTML(event.latitude ?? "")}" />
                </label>
                <label>
                  Longitude
                  <input data-pending-field="longitude" inputmode="decimal" value="${escapeAdminHTML(event.longitude ?? "")}" />
                </label>
                <label class="pending-editor-wide">
                  Description
                  <textarea data-pending-field="description" rows="3">${escapeAdminHTML(event.description || "")}</textarea>
                </label>
                <label class="pending-editor-wide">
                  Status note
                  <textarea data-pending-field="status_note" rows="2" placeholder="What was verified on the official website?">${escapeAdminHTML(event.status_note || "")}</textarea>
                </label>
                <label class="pending-editor-wide">
                  Review reason
                  <input data-pending-field="review_reason" value="${escapeAdminHTML(event.review_reason || "")}" placeholder="missing_coordinates, possible_duplicate, date_expected" />
                </label>
                <label class="pending-editor-wide">
                  Internal review note
                  <textarea data-pending-field="review_note" rows="2" placeholder="Internal admin-only note">${escapeAdminHTML(event.review_note || "")}</textarea>
                </label>
              </div>
              <div class="pending-editor-actions">
                <button type="button" class="cancel-pending-edit-btn">
                  Cancel
                </button>
                <button type="button" class="save-pending-edit-btn">
                  Save changes
                </button>
              </div>
            </div>

            <div class="pending-card-footer">
              ${validUrl
                ? `
                  <a
                    class="pending-card-link"
                    href="${safeAdminUrl(event.event_url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open official website
                  </a>
                `
                : `
                  <span class="pending-card-link is-disabled">
                    Website unavailable
                  </span>
                `}

              <div class="pending-item-actions">
                <button
                  type="button"
                  class="edit-pending-event-btn"
                >
                  ${canApprove ? "Edit" : "Fix details"}
                </button>
                <button
                  type="button"
                  class="reject-event-btn"
                >
                  Reject
                </button>
                <button
                  type="button"
                  class="approve-event-btn"
                  ${canApprove ? "" : "title=\"Fix blocking issues before approval\""}
                >
                  Approve
                </button>
              </div>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;

  list
    .querySelectorAll(".pending-card")
    .forEach(card => {
      const event =
        pendingAdminEvents.find(item =>
          String(item.id) ===
          card.dataset.eventId
        );

      if (!event) {
        return;
      }

      card
        .querySelector("[data-pending-select]")
        ?.addEventListener(
          "change",
          updatePendingBulkSelectionCount
        );

      card
        .querySelector(".edit-pending-event-btn")
        ?.addEventListener(
          "click",
          () => togglePendingEventEditor(
            card,
            true
          )
        );

      card
        .querySelector(".cancel-pending-edit-btn")
        ?.addEventListener(
          "click",
          () => togglePendingEventEditor(
            card,
            false
          )
        );

      card
        .querySelector(".save-pending-edit-btn")
        ?.addEventListener(
          "click",
          () => savePendingEventEdits(
            card,
            event
          )
        );

      card
        .querySelector(".approve-event-btn")
        ?.addEventListener(
          "click",
          () => approveEvent(
            event.id,
            event
          )
        );

      card
        .querySelector(".reject-event-btn")
        ?.addEventListener(
          "click",
          () => rejectEvent(event.id)
        );
    });

  updatePendingBulkSelectionCount();
}

function togglePendingEventEditor(card, open) {
  const editor =
    card.querySelector(
      ".pending-card-editor"
    );

  if (!editor) {
    return;
  }

  editor.hidden =
    !open;

  card.classList.toggle(
    "is-editing",
    open
  );

  card
    .querySelector(
      ".edit-pending-event-btn"
    )
    ?.setAttribute(
      "aria-expanded",
      open
        ? "true"
        : "false"
    );

  if (open) {
    editor
      .querySelector("input")
      ?.focus();
  }
}

function getPendingEditorValue(card, field) {
  return card
    .querySelector(
      `[data-pending-field="${field}"]`
    )
    ?.value.trim() || "";
}

async function savePendingEventEdits(card, event) {
  const saveButton =
    card.querySelector(
      ".save-pending-edit-btn"
    );

  const payload = {
    event_name:
      getPendingEditorValue(
        card,
        "event_name"
      ),
    sport:
      getPendingEditorValue(
        card,
        "sport"
      ),
    date:
      getPendingEditorValue(
        card,
        "date"
      ),
    city:
      getPendingEditorValue(
        card,
        "city"
      ),
    country:
      getPendingEditorValue(
        card,
        "country"
      ),
    address:
      getPendingEditorValue(
        card,
        "address"
      ),
    distance:
      getPendingEditorValue(
        card,
        "distance"
      ),
    event_url:
      getPendingEditorValue(
        card,
        "event_url"
      ),
    description:
      getPendingEditorValue(
        card,
        "description"
      ),
    registration_status:
      getPendingEditorValue(
        card,
        "registration_status"
      ) || "unclear",
    review_priority:
      getPendingEditorValue(
        card,
        "review_priority"
      ) || "medium",
    source_type:
      getPendingEditorValue(
        card,
        "source_type"
      ) || "unknown",
    review_status:
      getPendingEditorValue(
        card,
        "review_status"
      ) || "pending",
    import_batch:
      getPendingEditorValue(
        card,
        "import_batch"
      ) || null,
    review_reason:
      getPendingEditorValue(
        card,
        "review_reason"
      ) || null,
    review_note:
      getPendingEditorValue(
        card,
        "review_note"
      ) || null,
    status_note:
      getPendingEditorValue(
        card,
        "status_note"
      )
  };

  const missingRequired =
    [
      "event_name",
      "sport",
      "date",
      "city",
      "country",
      "distance",
      "event_url"
    ]
      .filter(field =>
        !payload[field]
      );

  if (missingRequired.length) {
    showAppMessage(
      "Required fields missing",
      "Name, sport, date, city, country, distance and official website are required."
    );
    return;
  }

  if (!isGermanDateString(payload.date)) {
    showAppMessage(
      "Invalid date",
      "Use the format DD.MM.YYYY."
    );
    return;
  }

  if (!isOfficialAdminEventUrl(payload.event_url)) {
    showAppMessage(
      "Official website required",
      "Enter the organizer's official HTTP or HTTPS website, not an event aggregator."
    );
    return;
  }

  const latitude =
    getPendingEditorValue(
      card,
      "latitude"
    );

  const longitude =
    getPendingEditorValue(
      card,
      "longitude"
    );

  if (
    (latitude && !longitude) ||
    (!latitude && longitude)
  ) {
    showAppMessage(
      "Incomplete coordinates",
      "Enter both latitude and longitude, or leave both empty for geocoding on approval."
    );
    return;
  }

  if (latitude && longitude) {
    payload.latitude =
      Number(latitude.replace(",", "."));

    payload.longitude =
      Number(longitude.replace(",", "."));

    if (!hasValidCoordinates(payload)) {
      showAppMessage(
        "Invalid coordinates",
        "Latitude must be between -90 and 90, and longitude between -180 and 180."
      );
      return;
    }
  } else {
    payload.latitude = null;
    payload.longitude = null;
  }

  setButtonLoading(
    saveButton,
    true,
    "Saving..."
  );

  let {
    data,
    error
  } = await supabaseClient
    .from("events")
    .update(payload)
    .eq("id", event.id)
    .in(
      "status",
      [
        "pending",
        "staging",
        "needs_review",
        "date_expected"
      ]
    )
    .select("*");

  if (
    error &&
    /source_type|review_status|review_reason|review_note|import_batch/i.test(
      String(error.message || "")
    )
  ) {
    const fallbackPayload = {
      ...payload
    };

    [
      "source_type",
      "review_status",
      "review_reason",
      "review_note",
      "import_batch"
    ].forEach(field => {
      delete fallbackPayload[field];
    });

    const fallback =
      await supabaseClient
        .from("events")
        .update(fallbackPayload)
        .eq("id", event.id)
        .in(
          "status",
          [
            "pending",
            "staging",
            "needs_review",
            "date_expected"
          ]
        )
        .select("*");

    data =
      fallback.data;

    error =
      fallback.error;
  }

  setButtonLoading(
    saveButton,
    false
  );

  if (
    error ||
    !(data || []).length
  ) {
    console.error(
      "Pending event update failed:",
      error
    );

    showAppMessage(
      "Changes not saved",
      getFriendlyErrorMessage(
        error,
        "The pending event could not be updated."
      )
    );
    return;
  }

  pendingAdminEvents =
    pendingAdminEvents.map(item =>
      String(item.id) ===
      String(event.id)
        ? data[0]
        : item
    );

  renderPendingEvents();
  await loadAdminSummary();

  showAppMessage(
    "Submission updated",
    "The corrected event details were saved."
  );
}

async function loadPendingEvents() {
  const list =
    document.getElementById(
      "pendingEventsList"
    );

  if (!list) {
    return;
  }

  list.innerHTML =
    `<div class="admin-list-skeleton" aria-label="Loading submissions"><span></span><span></span><span></span></div>`;

  if (pendingEventsSummary) {
    pendingEventsSummary.textContent =
      "Loading submissions...";
  }

  setButtonLoading(
    refreshPendingEventsBtn,
    true,
    "Refreshing..."
  );

  const {
    data,
    error
  } = await supabaseClient
    .from("events")
    .select("*")
    .in(
      "status",
      [
        "pending",
        "staging",
        "needs_review",
        "date_expected"
      ]
    )
    .order("created_at", {
      ascending: true
    });

  setButtonLoading(
    refreshPendingEventsBtn,
    false
  );

  if (error) {
    console.error(
      "Could not load pending events:",
      error
    );

    pendingAdminEvents = [];

    list.innerHTML = `
      <div class="admin-error-state">
        <strong>Pending submissions could not be loaded</strong>
        <span>Check your admin role and the events RLS policies.</span>
        <button type="button" data-retry-pending>Try again</button>
      </div>
    `;

    list
      .querySelector("[data-retry-pending]")
      ?.addEventListener(
        "click",
        loadPendingEvents
      );

    if (pendingEventsSummary) {
      pendingEventsSummary.textContent =
        "Submissions unavailable.";
    }

    return;
  }

  pendingAdminEvents =
    data || [];

  updatePendingBatchFilterOptions();

  console.log(
    "Loaded pending events:",
    pendingAdminEvents
  );

  renderPendingEvents();
}


function hasValidCoordinates(event) {
  const latitude =
    Number(event.latitude);

  const longitude =
    Number(event.longitude);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );

}


function setPendingCardBusy(
  id,
  busy,
  action = "Working..."
) {
  const card =
    Array
      .from(
        document.querySelectorAll(
          ".pending-card"
        )
      )
      .find(item =>
        item.dataset.eventId ===
        String(id)
      );

  if (!card) {
    return;
  }

  card.classList.toggle(
    "is-busy",
    busy
  );

  card.setAttribute(
    "aria-busy",
    busy
      ? "true"
      : "false"
  );

  card
    .querySelectorAll(
      ".approve-event-btn, .reject-event-btn"
    )
    .forEach(button => {
      button.disabled =
        busy;
    });

  const activeButton =
    card.querySelector(
      action === "Approving..."
        ? ".approve-event-btn"
        : ".reject-event-btn"
    );

  if (activeButton) {
    setButtonLoading(
      activeButton,
      busy,
      action
    );
  }
}


function removePendingCard(id) {

  const card =
    Array
      .from(document.querySelectorAll(".pending-card"))
      .find(item =>
        item.dataset.eventId === String(id)
      );

  if (card) {
    card.classList.add(
      "is-resolved"
    );
  }

  pendingAdminEvents =
    pendingAdminEvents.filter(event =>
      String(event.id) !== String(id)
    );

  window.setTimeout(
    renderPendingEvents,
    card ? 180 : 0
  );

}


async function refreshAdminDashboard() {

  await loadAdminSummary();

  await loadPendingEvents();

}


async function getPendingEventById(id) {

  const {
    data,
    error
  } = await supabaseClient
    .from("events")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (error) {

    console.error(error);

    return null;

  }

  return (data || [])[0] || null;

}


async function updateEventStatusDirectly(
  id,
  updatePayload
) {

  const {
    data,
    error
  } = await supabaseClient
    .from("events")
    .update(updatePayload)
    .eq("id", id)
    .in(
      "status",
      [
        "pending",
        "staging",
        "needs_review",
        "date_expected"
      ]
    )
    .select("*");

  if (error) {

    console.error(error);

    return {
      ok: false,
      error
    };

  }

  if (data && data.length) {

    return {
      ok: true,
      source: "client",
      event: data[0]
    };

  }

  console.warn(
    "Supabase status update affected no readable rows:",
    {
      id,
      updatePayload
    }
  );

  return {
    ok: false,
    noRows: true
  };

}


async function persistEventStatus(
  id,
  updatePayload
) {
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  const auditedPayload = {
    ...updatePayload,
    reviewed_at:
      new Date().toISOString(),
    reviewed_by:
      user?.id || null
  };

  const result =
    await updateEventStatusDirectly(
      id,
      auditedPayload
    );

  if (
    !result.ok &&
    result.error &&
    /reviewed_at|reviewed_by|review_status|review_reason|review_note|source_type|import_batch/i.test(
      String(result.error.message || "")
    )
  ) {
    console.warn(
      "Admin audit columns are not installed yet. Retrying the status update without audit metadata."
    );

    const fallbackPayload = {
      ...updatePayload
    };

    [
      "reviewed_at",
      "reviewed_by",
      "review_status",
      "review_reason",
      "review_note",
      "source_type",
      "import_batch"
    ].forEach(field => {
      delete fallbackPayload[field];
    });

    return await updateEventStatusDirectly(
      id,
      fallbackPayload
    );
  }

  return result;
}


async function approveEvent(id, pendingEvent = null) {

  setPendingCardBusy(
    id,
    true,
    "Approving..."
  );

  const eventToApprove =
    pendingEvent ||
    await getPendingEventById(id);

  if (!eventToApprove) {

    showAppMessage(
      "Approval failed",
      "Event could not be loaded for approval."
    );

    setPendingCardBusy(
      id,
      false,
      "Approving..."
    );

    return;

  }

  const blockingIssues =
    getBlockingPendingIssues(
      eventToApprove
    );

  if (blockingIssues.length) {
    const card =
      Array
        .from(
          document.querySelectorAll(
            ".pending-card"
          )
        )
        .find(item =>
          item.dataset.eventId ===
          String(id)
        );

    if (card) {
      togglePendingEventEditor(
        card,
        true
      );
    }

    showAppMessage(
      "Review required",
      `Correct these items before approval: ${blockingIssues
        .map(issue => issue.label)
        .join(", ")}.`
    );

    setPendingCardBusy(
      id,
      false,
      "Approving..."
    );

    return;
  }

  const updatePayload = {
    status: "approved",
    review_status: "approved",
    review_reason: "admin_approved",
    review_note:
      eventToApprove.review_note ||
      eventToApprove.status_note ||
      null,
    last_checked:
      new Date().toISOString(),
    needs_review:
      !eventToApprove.registration_status ||
      eventToApprove.registration_status === "unclear"
  };

  if (!hasValidCoordinates(eventToApprove)) {

    const coordinates =
      await geocodeEventLocation(
        eventToApprove.address,
        eventToApprove.city,
        eventToApprove.country
      );

    if (!coordinates) {

      showAppMessage(
        "Approval failed",
        "Event cannot be approved because the location could not be geocoded."
      );

      setPendingCardBusy(
        id,
        false,
        "Approving..."
      );

      return;

    }

    updatePayload.latitude =
      coordinates.latitude;

    updatePayload.longitude =
      coordinates.longitude;

  }

  else {

    updatePayload.latitude =
      Number(eventToApprove.latitude);

    updatePayload.longitude =
      Number(eventToApprove.longitude);

  }

  const updateResult =
    await persistEventStatus(
      id,
      updatePayload
    );

  if (!updateResult.ok) {

    console.warn(
      "Supabase approval did not persist. Check RLS policies, admin role, status value, and event id.",
      {
        id,
        updatePayload,
        error: updateResult.error,
        noRows: updateResult.noRows
      }
    );

    showAppMessage(
      "Approval failed",
      "The approval could not be saved. Please confirm your admin session and try again."
    );

    setPendingCardBusy(
      id,
      false,
      "Approving..."
    );

    return;

  }

  console.log("Approved event:", id);

  removePendingCard(id);

  await loadAdminSummary();

  const reloadEvents =
    window.refreshEvents ||
    (
      typeof refreshEvents === "function"
        ? refreshEvents
        : null
    );

  if (typeof reloadEvents === "function") {
    await Promise.resolve(
      reloadEvents()
    );

  }

  showAppMessage(
    "Event approved",
    "The event is approved and the map has been refreshed."
  );

}


async function rejectEvent(id) {

  setPendingCardBusy(
    id,
    true,
    "Rejecting..."
  );

  const updatePayload = {
    status: "rejected",
    review_status: "rejected",
    review_reason: "admin_rejected",
    needs_review: false
  };

  const updateResult =
    await persistEventStatus(
      id,
      updatePayload
    );

  if (!updateResult.ok) {

    console.warn(
      "Supabase rejection did not persist. Check RLS policies, admin role, status value, and event id.",
      {
        id,
        error: updateResult.error,
        noRows: updateResult.noRows
      }
    );

    showAppMessage(
      "Reject failed",
      "The rejection could not be saved. Please confirm your admin session and try again."
    );

    setPendingCardBusy(
      id,
      false,
      "Rejecting..."
    );

    return;

  }

  console.log("Rejected event:", id);

  removePendingCard(id);

  await loadAdminSummary();

  const reloadEvents =
    window.refreshEvents ||
    (
      typeof refreshEvents === "function"
        ? refreshEvents
        : null
    );

  if (typeof reloadEvents === "function") {
    await Promise.resolve(
      reloadEvents()
    );

  }

  showAppMessage(
    "Event rejected",
    "The event was rejected and removed from the pending list."
  );

}

window.approveEvent =
  approveEvent;

window.rejectEvent =
  rejectEvent;

window.loadPendingEvents =
  loadPendingEvents;

function setStagingImportStatus(message, type = "") {
  if (!adminStagingImportStatus) {
    return;
  }

  adminStagingImportStatus.className =
    `admin-import-status ${type}`.trim();

  adminStagingImportStatus.textContent =
    message;
}

function getStagingCell(row, ...fields) {
  for (const field of fields) {
    const value =
      row[field];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(value).trim();
    }
  }

  return "";
}

function normalizeStagingRegistrationStatus(value) {
  const status =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    [
      "registration_open",
      "registration_not_open",
      "sold_out",
      "cancelled",
      "date_expected",
      "confirmed",
      "unclear"
    ].includes(status)
  ) {
    return status;
  }

  if (/open|offen/.test(status)) {
    return "registration_open";
  }

  if (/sold|ausverkauft/.test(status)) {
    return "sold_out";
  }

  if (/cancel|abgesagt/.test(status)) {
    return "cancelled";
  }

  return "unclear";
}

function mapStagingRowToEvent(row) {
  const reviewReason =
    getStagingCell(
      row,
      "review_reason",
      "review_reasons"
    );

  const sourceType =
    getStagingCell(
      row,
      "source_type"
    ) || "unknown";

  const officialWebsite =
    getStagingCell(
      row,
      "official_website",
      "event_url",
      "url"
    );

  const registrationStatus =
    normalizeStagingRegistrationStatus(
      getStagingCell(
        row,
        "registration_status",
        "verification_status",
        "status_label"
      )
    );

  const latitude =
    getStagingCell(row, "latitude", "lat");

  const longitude =
    getStagingCell(row, "longitude", "lng", "lon");

  const event = {
    event_name:
      getStagingCell(row, "event_name", "name"),
    sport:
      getStagingCell(row, "sport") || "Running",
    distance:
      getStagingCell(row, "distance", "distance_category"),
    date:
      getStagingCell(row, "date"),
    city:
      getStagingCell(row, "city"),
    country:
      getStagingCell(row, "country") || "Germany",
    address:
      getStagingCell(row, "address"),
    latitude:
      latitude
        ? Number(latitude.replace(",", "."))
        : null,
    longitude:
      longitude
        ? Number(longitude.replace(",", "."))
        : null,
    description:
      getStagingCell(row, "description") ||
      `Imported event staged for admin review.`,
    event_url:
      officialWebsite,
    source_url:
      getStagingCell(row, "source_url") ||
      officialWebsite,
    data_source:
      sourceType === "official"
        ? "Official organizer website"
        : "Batch import staging",
    verification_status:
      registrationStatus,
    registration_status:
      registrationStatus,
    status:
      reviewReason
        ? "needs_review"
        : "staging",
    review_status:
      reviewReason
        ? "needs_review"
        : "pending",
    review_reason:
      reviewReason || null,
    review_note:
      getStagingCell(row, "review_note") || null,
    status_note:
      getStagingCell(row, "status_note") ||
      getStagingCell(row, "review_note") ||
      "",
    source_type:
      sourceType,
    import_batch:
      getStagingCell(row, "import_batch") ||
      "manual-staging-import",
    last_checked:
      getStagingCell(row, "last_checked") ||
      null,
    needs_review:
      Boolean(reviewReason) ||
      sourceType !== "official" ||
      registrationStatus === "unclear"
  };

  return event;
}

function getStagingPreviewStats(rows) {
  const mapped =
    rows.map(mapStagingRowToEvent);

  return {
    total:
      mapped.length,
    ready:
      mapped.filter(event =>
        getPendingEventReadiness(event).canApprove
      ).length,
    blockers:
      mapped.filter(event =>
        !getPendingEventReadiness(event).canApprove
      ).length,
    needsReview:
      mapped.filter(event =>
        event.review_reason ||
        event.source_type !== "official" ||
        event.registration_status === "unclear"
      ).length
  };
}

function renderStagingPreview() {
  if (!adminStagingPreviewList) {
    return;
  }

  if (!adminStagingPreviewRows.length) {
    adminStagingPreviewList.innerHTML = "";
    if (saveStagingCsvBtn) {
      saveStagingCsvBtn.disabled = true;
    }
    return;
  }

  const stats =
    getStagingPreviewStats(
      adminStagingPreviewRows
    );

  const mappedRows =
    adminStagingPreviewRows
      .map(mapStagingRowToEvent);

  adminStagingPreviewList.innerHTML = `
    <div class="admin-staging-preview-summary">
      <div><span>Total rows</span><strong>${stats.total}</strong></div>
      <div><span>Technically ready</span><strong>${stats.ready}</strong></div>
      <div><span>Need fixes</span><strong>${stats.blockers}</strong></div>
      <div><span>Need human review</span><strong>${stats.needsReview}</strong></div>
    </div>
    <div class="admin-staging-preview-list">
      ${mappedRows.slice(0, 12).map(event => {
        const readiness =
          getPendingEventReadiness(event);

        return `
          <article class="admin-staging-preview-card ${readiness.canApprove ? "is-ready" : "needs-attention"}">
            <div>
              <strong>${escapeAdminHTML(event.event_name || "Untitled event")}</strong>
              <span>${escapeAdminHTML(event.date || "No date")} · ${escapeAdminHTML(event.city || "-")}, ${escapeAdminHTML(event.country || "-")}</span>
            </div>
            <p>${escapeAdminHTML(event.distance || "No distance")} · ${escapeAdminHTML(event.event_url || "No website")}</p>
            <em>${readiness.canApprove ? "Can be reviewed in Submissions" : readiness.blockingIssues.map(issue => issue.label).join(", ")}</em>
          </article>
        `;
      }).join("")}
    </div>
    ${mappedRows.length > 12
      ? `<p class="admin-import-status">Showing 12 of ${mappedRows.length} rows. Save to review queue to work through the full batch.</p>`
      : ""}
  `;

  if (saveStagingCsvBtn) {
    saveStagingCsvBtn.disabled =
      !adminStagingPreviewRows.length;
  }
}

async function previewLocalStagingCsv() {
  const file =
    adminStagingCsvInput?.files?.[0];

  if (!file) {
    setStagingImportStatus(
      "Choose a staging CSV first.",
      "error"
    );
    return;
  }

  setButtonLoading(
    previewStagingCsvBtn,
    true,
    "Reading..."
  );

  try {
    const csvText =
      await file.text();

    const parsed =
      Papa.parse(csvText, {
        header: true,
        delimiter: ";",
        skipEmptyLines: true
      });

    if (parsed.errors?.length) {
      console.warn(
        "Staging CSV parser warnings:",
        parsed.errors
      );
    }

    adminStagingPreviewRows =
      (parsed.data || [])
        .filter(row =>
          row &&
          getStagingCell(
            row,
            "event_name",
            "name"
          )
        );

    renderStagingPreview();

    setStagingImportStatus(
      `Preview ready: ${adminStagingPreviewRows.length} rows loaded. Nothing is public yet.`,
      "success"
    );
  } catch (error) {
    console.error(
      "Could not preview staging CSV:",
      error
    );

    adminStagingPreviewRows = [];
    renderStagingPreview();

    setStagingImportStatus(
      "CSV preview failed. Check the file format.",
      "error"
    );
  } finally {
    setButtonLoading(
      previewStagingCsvBtn,
      false
    );
  }
}

function stripUnsupportedImportFields(payload, error) {
  const message =
    String(error?.message || "");

  const fallback =
    {
      ...payload
    };

  if (
    /source_type|review_status|review_reason|review_note|import_batch|last_checked/i.test(
      message
    )
  ) {
    [
      "source_type",
      "review_status",
      "review_reason",
      "review_note",
      "import_batch",
      "last_checked"
    ].forEach(field => {
      delete fallback[field];
    });
  }

  if (
    /events_status_check|status/i.test(message) &&
    ![
      "pending",
      "approved",
      "rejected"
    ].includes(fallback.status)
  ) {
    fallback.status =
      "pending";
  }

  return fallback;
}

async function insertStagingEvents(rows) {
  const payload =
    rows.map(mapStagingRowToEvent);

  let result =
    await supabaseClient
      .from("events")
      .insert(payload)
      .select("*");

  if (
    result.error &&
    /source_type|review_status|review_reason|review_note|import_batch|last_checked|events_status_check|status/i.test(
      String(result.error.message || "")
    )
  ) {
    const fallbackPayload =
      payload.map(item =>
        stripUnsupportedImportFields(
          item,
          result.error
        )
      );

    result =
      await supabaseClient
        .from("events")
        .insert(fallbackPayload)
        .select("*");
  }

  return result;
}

async function saveLocalStagingCsvToSupabase() {
  if (!adminStagingPreviewRows.length) {
    setStagingImportStatus(
      "Preview a staging CSV before saving.",
      "error"
    );
    return;
  }

  const confirmed =
    window.confirm(
      `Save ${adminStagingPreviewRows.length} events to the admin review queue? They will not be public until approved.`
    );

  if (!confirmed) {
    return;
  }

  setButtonLoading(
    saveStagingCsvBtn,
    true,
    "Saving..."
  );

  try {
    const chunkSize = 50;
    let inserted = 0;

    for (
      let index = 0;
      index < adminStagingPreviewRows.length;
      index += chunkSize
    ) {
      const chunk =
        adminStagingPreviewRows.slice(
          index,
          index + chunkSize
        );

      const { data, error } =
        await insertStagingEvents(chunk);

      if (error) {
        throw error;
      }

      inserted +=
        (data || []).length;
    }

    setStagingImportStatus(
      `${inserted} events saved to the review queue. Open Submissions to edit and approve them.`,
      "success"
    );

    adminStagingPreviewRows = [];
    renderStagingPreview();

    await loadPendingEvents();
    await loadAdminSummary();
    setAdminTab("review");
  } catch (error) {
    console.error(
      "Could not save staging CSV to Supabase:",
      error
    );

    setStagingImportStatus(
      getFriendlyErrorMessage(
        error,
        "Staging import failed. Check SQL fields, RLS admin policies and required columns."
      ),
      "error"
    );
  } finally {
    setButtonLoading(
      saveStagingCsvBtn,
      false
    );
  }
}


function formatInputDate(date) {

  return date
    .toISOString()
    .slice(0, 10);

}


function initWorldTriathlonImportDates() {

  if (
    wtStartDate.value &&
    wtEndDate.value
  ) {

    return;

  }

  const start =
    new Date();

  const end =
    new Date();

  end.setFullYear(
    end.getFullYear() + 1
  );

  wtStartDate.value =
    formatInputDate(start);

  wtEndDate.value =
    formatInputDate(end);

}


function setWorldTriathlonImportStatus(
  message,
  type = "info"
) {

  worldTriathlonImportStatus.className =
    `admin-import-status ${type}`;

  worldTriathlonImportStatus.textContent =
    message;

}


function renderWorldTriathlonPreview(events) {

  worldTriathlonPreviewList.innerHTML = "";

  if (!events.length) {

    worldTriathlonPreviewList.innerHTML =
      `<p class="admin-import-empty">No events found.</p>`;

    return;

  }

  events
    .slice(0, 12)
    .forEach(event => {

      const div =
        document.createElement("div");

      div.className =
        "admin-import-preview-item";

      div.innerHTML = `

        <strong>
          ${escapeAdminHTML(event.event_name)}
        </strong>

        <span>
          ${escapeAdminHTML(event.date)} &middot; ${escapeAdminHTML(event.city)}, ${escapeAdminHTML(event.country)}
        </span>

      `;

      worldTriathlonPreviewList.appendChild(div);

    });

  if (events.length > 12) {

    const more =
      document.createElement("p");

    more.className =
      "admin-import-empty";

    more.textContent =
      `+ ${events.length - 12} more events`;

    worldTriathlonPreviewList.appendChild(more);

  }

}


async function runWorldTriathlonImport(save = false) {
  if (
    !wtStartDate?.value ||
    !wtEndDate?.value
  ) {
    setWorldTriathlonImportStatus(
      "Choose a start and end date.",
      "error"
    );
    return;
  }

  if (
    Date.parse(wtStartDate.value) >
    Date.parse(wtEndDate.value)
  ) {
    setWorldTriathlonImportStatus(
      "The start date must be before the end date.",
      "error"
    );
    return;
  }

  setWorldTriathlonImportStatus(
    save
      ? "Saving World Triathlon events..."
      : "Loading World Triathlon preview..."
  );

  previewWorldTriathlonBtn.disabled = true;

  saveWorldTriathlonBtn.disabled = true;

  try {
    const { data, error } =
      await supabaseClient.functions.invoke(
        "import-world-triathlon",
        {
          body: {
            start_date:
              wtStartDate.value,
            end_date:
              wtEndDate.value,
            save
          }
        }
      );

    if (error) {
      console.error(
        "World Triathlon import failed:",
        error
      );

      setWorldTriathlonImportStatus(
        "The import service is unavailable. Confirm that the Supabase Edge Function is deployed.",
        "error"
      );
      return;
    }

    if (data?.error) {
      setWorldTriathlonImportStatus(
        String(data.error),
        "error"
      );
      return;
    }

    if (save) {
      setWorldTriathlonImportStatus(
        `Imported ${data?.imported || 0} events as pending. Skipped ${data?.duplicates || 0} duplicates.`,
        "success"
      );

      worldTriathlonPreviewList.innerHTML = "";

      await Promise.all([
        loadPendingEvents(),
        loadAdminSummary()
      ]);

      return;
    }

    setWorldTriathlonImportStatus(
      `Preview loaded: ${data?.count || 0} events found.`,
      "success"
    );

    renderWorldTriathlonPreview(
      data?.events || []
    );
  } catch (error) {
    console.error(
      "World Triathlon import request failed:",
      error
    );

    setWorldTriathlonImportStatus(
      "The import request failed. Check the network connection and Edge Function setup.",
      "error"
    );
  } finally {
    previewWorldTriathlonBtn.disabled = false;
    saveWorldTriathlonBtn.disabled = false;
  }

}


if (previewWorldTriathlonBtn) {

  previewWorldTriathlonBtn.addEventListener(
    "click",
    () => runWorldTriathlonImport(false)
  );

}


if (saveWorldTriathlonBtn) {

  saveWorldTriathlonBtn.addEventListener(
    "click",
    () => runWorldTriathlonImport(true)
  );

}

