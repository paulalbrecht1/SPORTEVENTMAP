(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SportEventMapDescriptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Match known import templates, never isolated words such as "review", "batch"
  // or an organizer's ordinary reference to marathon.de. This is a presentation
  // projection; callers keep the original database value for editing and audit.
  function cleanPublicEventDescription(value) {
    if (value === null || value === undefined) return "";
    let result = String(value).trim();
    const boundary = "(^|[.!?]\\s+|[\\r\\n]+)";
    let previous;
    do {
      previous = result;
      result = result.replace(new RegExp(boundary + "Imported from (?:verified staging batch|marathon\\.de(?:[ \\t]+(?:running calendar|Laufkalender))?)[ \\t]*\\.?(?=\\s|$)", "gi"), "$1");
      result = result.replace(/\bSource listing:[ \t]*https?:\/\/[^\s<>"']+/gi, "");
      // Place names can contain common abbreviations (St. Anton, Hofheim i. UFr.).
      // A following real sentence is retained rather than deleting the paragraph.
      result = result.replace(new RegExp(boundary + "Official endurance event in (?:\\b(?:St|i|a|b|d|UFr)\\.[ \\t]*|[^.!?\\r\\n])+(?:\\.|(?=[\\r\\n]|$))", "gi"), "$1");
      result = result.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    } while (result !== previous);
    return /^[\s.!?;:-]*$/.test(result) ? "" : result;
  }

  return { cleanPublicEventDescription };
});
