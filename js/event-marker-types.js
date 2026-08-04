(function exposeEventMarkerTypes(globalScope) {
  const MARATHON_DISTANCE_KM = 42.195;

  function getMaximumEventDistanceKm(value) {
    const text = String(value || "")
      .toLowerCase()
      .replace(/,/g, ".");
    const distances = [];
    const distancePattern =
      /\b(\d+(?:\.\d+)?)\s*[-–]?\s*(km|kilometers?|kilometres?|kilometer|kilometre|k|miles?|mi)\b/g;
    let match;

    while ((match = distancePattern.exec(text))) {
      const amount = Number(match[1]);
      const unit = match[2];
      distances.push(
        /^(?:mi|mile)/.test(unit)
          ? amount * 1.609344
          : amount
      );
    }

    if (/\bmarathon\b/.test(text)) {
      distances.push(MARATHON_DISTANCE_KM);
    }

    return distances.length
      ? Math.max(...distances)
      : null;
  }

  function hasTimedUltraDistance(value) {
    const text = String(value || "").toLowerCase();
    const match =
      text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:h|hours?|stunden?)\b/);

    return match
      ? Number(match[1].replace(",", ".")) >= 6
      : false;
  }

  function getEventMarkerType(event) {
    const sport = String(event?.sport || "")
      .trim()
      .toLowerCase();
    const name = String(event?.event_name || "")
      .toLowerCase();
    const distance = String(event?.distance || "")
      .toLowerCase();
    const maximumDistanceKm =
      getMaximumEventDistanceKm(distance);

    if (
      sport === "triathlon" ||
      /\btriathlon\b|\bironman\b|\b70\.3\b/.test(name)
    ) {
      return "triathlon";
    }

    if (
      maximumDistanceKm !== null &&
      maximumDistanceKm > MARATHON_DISTANCE_KM
    ) {
      return "ultra";
    }

    if (hasTimedUltraDistance(distance)) {
      return "ultra";
    }

    if (
      /\bultra(?:marathon)?\b|\bbackyard\b|\butmb\b/.test(
        name + " " + distance
      )
    ) {
      return "ultra";
    }

    return "running";
  }

  const api = {
    MARATHON_DISTANCE_KM,
    getEventMarkerType,
    getMaximumEventDistanceKm,
    hasTimedUltraDistance
  };

  globalScope.SportEventMapMarkerTypes = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
