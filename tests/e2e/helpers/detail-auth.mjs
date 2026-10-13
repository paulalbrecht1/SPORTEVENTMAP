// Simulate only the authenticated Supabase SDK boundary. Production detail
// handlers still load their client and verify the current user normally.
export async function useSignedInDetailCloud(page, options = {}) {
  for (const sdk of [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js**",
    "https://unpkg.com/@supabase/supabase-js**"
  ]) {
    await page.route(sdk, route => route.fulfill({
      contentType: "text/javascript",
      body: ""
    }));
  }

  await page.addInitScript(({ remoteSaved, failTable }) => {
    const remoteKey = "sportEventMap.detailTestRemote";
    const user = { id: "detail-test-user" };
    const state = JSON.parse(sessionStorage.getItem(remoteKey) || "null") || {
      initialSaved: remoteSaved,
      seeded: false,
      rows: {},
      operations: []
    };
    const persist = () => sessionStorage.setItem(remoteKey, JSON.stringify(state));
    persist();
    window.__detailCloudOperationLog = state.operations;
    window.__detailCloudSavedRows = state.rows;

    const client = {
      auth: {
        async getUser() { return { data: { user }, error: null }; }
      },
      from(table) {
        let operation = "select";
        const filters = new Map();
        const error = () => failTable === table
          ? { message: "forced detail sync failure" }
          : null;
        return {
          select() { operation = "select"; return this; },
          delete() { operation = "delete"; return this; },
          eq(key, value) { filters.set(key, value); return this; },
          async limit() {
            const eventKey = filters.get("event_id");
            if (state.initialSaved && !state.seeded) {
              state.rows[eventKey] = { user_id: user.id, event_id: eventKey };
              state.seeded = true;
              persist();
            }
            return {
              data: Object.values(state.rows).filter(row =>
                [...filters].every(([key, value]) => row[key] === value)
              ),
              error: null
            };
          },
          async upsert(row) {
            state.operations.push({ table, operation: "upsert", row });
            const failure = error();
            if (!failure) state.rows[row.event_id] = { ...row };
            persist();
            return { data: null, error: failure };
          },
          then(resolve) {
            state.operations.push({ table, operation });
            const failure = error();
            if (operation === "delete" && !failure) {
              for (const [key, row] of Object.entries(state.rows)) {
                if ([...filters].every(([field, value]) => row[field] === value)) {
                  delete state.rows[key];
                }
              }
            }
            persist();
            resolve({ data: [], error: failure });
          }
        };
      }
    };
    window.supabase = { createClient: () => client };
  }, {
    remoteSaved: options.remoteSaved === true,
    failTable: options.failTable || ""
  });
}
