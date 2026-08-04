export const SAFE_BULK_ACTIONS = new Set([
  "confirm_unchanged_sources", "accept_safe_registration_changes", "complete_past_editions",
  "retry_selected_sources", "reject_discovery_candidates", "assign_candidates_to_event", "reschedule_next_check"
]);

export function planBulkOperation(action, items = [], options = {}) {
  if (!SAFE_BULK_ACTIONS.has(action)) throw new Error("unsupported_bulk_action");
  if (!Array.isArray(items) || !items.length) throw new Error("bulk_items_required");
  if (items.length > Number(options.maxItems || 100)) throw new Error("bulk_item_limit_exceeded");
  const unique = [...new Set(items.map(String))];
  return {
    action, affectedCount: unique.length, itemIds: unique,
    dryRun: options.dryRun !== false,
    confirmationRequired: true,
    transactional: true,
    impact: options.impact || `Die Aktion ${action} betrifft ${unique.length} ausgewählte Datensätze.`,
    rollbackStrategy: "transaction_rollback_on_any_error"
  };
}
