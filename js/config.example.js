window.SPORT_EVENT_MAP_CONFIG = {
  supabaseUrl: "",
  supabasePublishableKey: "",

  // Leave empty locally. Set the deployed HTTPS origin before release.
  siteUrl: "",
  authCallbackPath: "index.html",
  passwordResetPath: "index.html",

  // Replace with the final product inbox before public launch.
  feedbackEmail: "kontakt@sporteventmap.com"
};

document.documentElement.dataset.appConfig = "loaded";
