import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const source = fs.readFileSync(
  path.join(root, "js", "event-detail.js"),
  "utf8"
);
const labels = {
  "detail.addSeason": "+ Add to Season",
  "detail.addingSeason": "Adding…",
  "detail.savedSeason": "✓ Added to Season",
  "detail.removeSeason": "Remove from Season",
  "detail.removingSeason": "Removing…",
  "detail.addedSeason": "Added to your Season Planner.",
  "detail.removedSeason": "Removed from your Season Planner.",
  "detail.saveUnavailable": "Could not save this event right now.",
  "detail.removeUnavailable": "Could not remove this event right now."
};
const eventKey =
  "test race|01.01.2027|berlin";

function createClassList() {
  const classes = new Set();

  return {
    classes,
    toggle(name, enabled) {
      if (enabled) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
    }
  };
}

function createCloud(options = {}) {
  const {
    remoteSaved = false,
    failTable = ""
  } = options;

  const calls = [];
  return {
    calls,
    auth: {
      async getUser() {
        return {
          data: {
            user: {
              id: "test-user"
            }
          }
        };
      }
    },
    from(table) {
      calls.push(table);
      let operation = "select";

      return {
        select() {
          operation = "select";
          return this;
        },
        delete() {
          operation = "delete";
          return this;
        },
        eq() {
          return this;
        },
        limit() {
          return Promise.resolve({
            data:
              remoteSaved
                ? [{ event_id: eventKey }]
                : [],
            error: null
          });
        },
        async upsert() {
          return {
            data: null,
            error:
              failTable === table
                ? { message: "forced failure" }
                : null
          };
        },
        then(resolve) {
          resolve({
            data: [],
            error:
              operation === "delete" &&
              failTable === table
                ? { message: "forced failure" }
                : null
          });
        }
      };
    }
  };
}

async function createHarness(options = {}) {
  const store =
    options.store || new Map();
  const handlers = {};
  const attributes = new Map();
  const button = {
    textContent: "",
    disabled: false,
    title: "",
    classList: createClassList(),
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    }
  };
  const status = {
    textContent: "",
    dataset: {}
  };
  const localStorage = {
    getItem(key) {
      return store.has(key)
        ? store.get(key)
        : null;
    },
    setItem(key, value) {
      if (options.failLocalWrite) {
        throw new Error("forced local write failure");
      }

      store.set(key, String(value));
    }
  };
  const context = {
    console: {
      warn() {}
    },
    document: {
      getElementById(id) {
        if (id === "addDetailEventToSeason") {
          return button;
        }

        if (id === "detailActionStatus") {
          return status;
        }

        return null;
      },
      querySelectorAll() {
        return [];
      }
    },
    history: {
      replaceState() {}
    },
    localStorage,
    window: {
      location: {
        hash: ""
      },
      addEventListener() {},
      sportEventMapDetailConfig: {
        event: {
          event_key: eventKey,
          event_slug: "test-race-2027",
          event_name: "Test Race"
        }
      },
      sportEventMapDetailI18n: {
        translate(key) {
          return labels[key] || key;
        }
      },
      SPORT_EVENT_MAP_CONFIG: {}
    }
  };

  if (options.cloud) {
    context.window.__sportEventMapDetailSupabaseClient =
      options.cloud;
  }

  vm.runInNewContext(source, context, {
    filename: "event-detail.js"
  });

  await new Promise(resolve => setImmediate(resolve));

  return {
    attributes,
    button,
    click: () => handlers.click(),
    status,
    store
  };
}

{
  const harness =
    await createHarness();

  assert.equal(
    harness.button.textContent,
    "+ Add to Season"
  );

  const firstClick = harness.click();
  const duplicateClick = harness.click();

  assert.equal(
    harness.button.textContent,
    "Adding…"
  );

  await Promise.all([
    firstClick,
    duplicateClick
  ]);

  assert.equal(
    harness.button.textContent,
    "✓ Added to Season"
  );
  assert.equal(
    harness.attributes.get("aria-pressed"),
    "true"
  );
  assert.deepEqual(
    JSON.parse(harness.store.get("seasonPlannerEvents")),
    [eventKey]
  );

  const reloaded =
    await createHarness({
      store: harness.store
    });

  assert.equal(
    reloaded.button.textContent,
    "✓ Added to Season"
  );

  await reloaded.click();

  assert.equal(
    reloaded.button.textContent,
    "+ Add to Season"
  );
  assert.equal(
    reloaded.status.textContent,
    "Removed from your Season Planner."
  );
  assert.deepEqual(
    JSON.parse(reloaded.store.get("seasonPlannerEvents")),
    []
  );
}

{
  const cloud = createCloud({
    remoteSaved: true
  });
  const harness =
    await createHarness({
      cloud
    });

  assert.equal(
    harness.button.textContent,
    "✓ Added to Season"
  );
  assert.deepEqual(
    JSON.parse(harness.store.get("seasonPlannerEvents")),
    [eventKey]
  );
  assert.equal(cloud.calls.includes("favorites"), false, "Season planning must not write event favorites.");
}

{
  const harness =
    await createHarness({
      cloud: createCloud({
        failTable: "season_planner_events"
      })
    });

  await harness.click();

  assert.equal(
    harness.button.textContent,
    "+ Add to Season"
  );
  assert.equal(
    harness.attributes.get("aria-pressed"),
    "false"
  );
  assert.equal(
    harness.status.textContent,
    "Could not save this event right now."
  );
  assert.deepEqual(
    JSON.parse(harness.store.get("seasonPlannerEvents") || "[]"),
    []
  );
}

console.log(
  "PASS event detail Season toggle states, persistence, deduplication and rollback"
);
