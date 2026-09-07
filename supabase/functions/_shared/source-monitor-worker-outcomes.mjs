// The RPC upserts by fingerprint: this counts accepted observations, including
// refreshes of an existing result candidate, rather than newly inserted rows.
export function countAcceptedResultCandidate(data) {
  return data?.accepted === true && typeof data.result_id === "string" && data.result_id.trim() ? 1 : 0;
}

export function cleanError(error) {
  const message = typeof error === "string" ? error
    : typeof error?.message === "string" ? error.message : "Unknown source monitor error";
  const code = typeof error?.code === "string" && /^(?:PGRST\d{3}|[A-Z0-9]{5})$/.test(error.code)
    ? `[${error.code}] ` : "";
  // PostgREST errors are plain objects. Keep their code/message, but never dump
  // details, hints, request headers, nested causes or other response properties.
  return `${code}${message}`
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]+|sbp_[A-Za-z0-9]+)\b/g, "[REDACTED]")
    .replace(/\b((?:[\w-]*(?:api[_-]?key|token|secret|password)|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, "$1[REDACTED]")
    .slice(0, 2000);
}

const stageFourCapabilities = ["stage_four_simulation", "stage_four_automation", "stage_four_shadow"];

export async function loadSourceMonitorRuntimeCapabilities(invoke) {
  const { data, error } = await invoke();
  if (error) throw new Error(`Runtime capability query failed: ${cleanError(error)}`);
  if (data?.schema_version !== 1 || typeof data.extraction_review !== "boolean"
    || stageFourCapabilities.some(name => typeof data[name] !== "boolean")) {
    throw new Error("Invalid Source Monitor runtime capabilities (schema_version 1 required).");
  }
  if (!data.extraction_review) throw new Error("Required Source Monitor capability unavailable: extraction_review.");
  return Object.freeze({
    schema_version: 1,
    extraction_review: true,
    stage_four_simulation: data.stage_four_simulation,
    stage_four_automation: data.stage_four_automation,
    stage_four_shadow: data.stage_four_shadow
  });
}

export async function runOptionalStageFourCall(capabilities, capability, invoke) {
  if (!stageFourCapabilities.includes(capability) || typeof capabilities?.[capability] !== "boolean") {
    throw new Error("Invalid optional Source Monitor capability.");
  }
  if (!capabilities[capability]) {
    return { skipped: "schema_capability_unavailable", capability, dry_run: true, public_event_changes: 0, error: null };
  }
  const { data, error } = await invoke();
  if (error) throw new Error(`Stage-4 call failed (${capability}): ${cleanError(error)}`);
  return data;
}
