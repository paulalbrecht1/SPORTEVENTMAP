(function () {
  const config =
    window.SPORT_EVENT_MAP_CONFIG || {};

  if (
    typeof supabase === "undefined" ||
    !supabase ||
    typeof supabase.createClient !== "function" ||
    !config.supabaseUrl ||
    !config.supabaseAnonKey
  ) {
    window.sportEventMapDetailSupabaseClient = null;
    return;
  }

  window.sportEventMapDetailSupabaseClient =
    supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );
})();
