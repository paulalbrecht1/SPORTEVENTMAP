import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_PAGE_SIZE,
  filterCurrentCatalogRows,
  fetchCompleteCatalog
} = require("../js/event-catalog-loader.js");

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

function createFakeClient(sourceRows, options = {}) {
  const requests = [];

  return {
    requests,
    from(table) {
      const state = {
        table,
        countRequested: false,
        filters: [],
        cursor: null,
        orderColumn: null,
        limit: DEFAULT_PAGE_SIZE
      };

      const query = {
        select(_columns, selectOptions = {}) {
          state.countRequested = selectOptions.count === "exact";
          return query;
        },
        eq(column, value) {
          state.filters.push({ column, value });
          return query;
        },
        gt(column, value) {
          state.cursor = { column, value };
          return query;
        },
        order(column) {
          state.orderColumn = column;
          return query;
        },
        limit(value) {
          state.limit = value;
          return query;
        },
        then(resolve, reject) {
          requests.push({ ...state });

          if (
            options.failTable === table &&
            requests.filter(request => request.table === table).length ===
              (options.failRequest || 1)
          ) {
            return Promise.resolve({
              data: null,
              count: null,
              error: { message: options.failMessage || "query failed" }
            }).then(resolve, reject);
          }

          let visibleRows = sourceRows.filter(row =>
            state.filters.every(filter =>
              row[filter.column] === filter.value
            )
          );

          visibleRows = visibleRows
            .slice()
            .sort((left, right) =>
              compareValues(
                left[state.orderColumn],
                right[state.orderColumn]
              )
            );

          const visibleCount = visibleRows.length;

          if (state.cursor) {
            visibleRows = visibleRows.filter(row =>
              compareValues(
                row[state.cursor.column],
                state.cursor.value
              ) > 0
            );
          }

          const responseLimit = Math.min(
            state.limit,
            options.responseCap ?? state.limit
          );
          const responseRows = visibleRows.slice(0, responseLimit);
          const count = state.countRequested
            ? options.reportedCount ?? visibleCount
            : null;

          return Promise.resolve({
            data: responseRows,
            count,
            error: null
          }).then(resolve, reject);
        }
      };

      return query;
    }
  };
}

function createEditionRows(count) {
  return Array.from({ length: count }, (_value, index) => ({
    edition_id: `edition-${String(index + 1).padStart(5, "0")}`,
    event_name: `Event ${index + 1}`
  }));
}

const largeRows = createEditionRows(1255);
const largeClient = createFakeClient(largeRows);
const largeCatalog = await fetchCompleteCatalog({
  client: largeClient,
  table: "public_event_discovery",
  orderColumn: "edition_id",
  pageSize: 500
});

assert.equal(largeCatalog.count, 1255);
assert.equal(largeCatalog.rows.length, 1255);
assert.equal(largeCatalog.pages, 3);
assert.equal(largeClient.requests.length, 3);
assert.equal(largeClient.requests[0].countRequested, true);
assert.equal(largeClient.requests[1].countRequested, false);
assert.equal(largeCatalog.rows[0].edition_id, "edition-00001");
assert.equal(largeCatalog.rows.at(-1).edition_id, "edition-01255");

const cappedClient = createFakeClient(largeRows, {
  responseCap: 200
});
const cappedCatalog = await fetchCompleteCatalog({
  client: cappedClient,
  table: "public_event_discovery",
  orderColumn: "edition_id",
  pageSize: 500
});

assert.equal(cappedCatalog.count, 1255);
assert.equal(cappedCatalog.rows.length, 1255);
assert.equal(cappedCatalog.pages, 7);
assert.equal(cappedCatalog.rows.at(-1).edition_id, "edition-01255");

const incompleteClient = createFakeClient(largeRows, {
  reportedCount: 1256
});

await assert.rejects(
  () => fetchCompleteCatalog({
    client: incompleteClient,
    table: "public_event_discovery",
    orderColumn: "edition_id",
    pageSize: 500
  }),
  error => error.code === "CATALOG_INCOMPLETE"
);

const duplicateClient = createFakeClient([
  { edition_id: "edition-00001" },
  { edition_id: "edition-00001" }
]);

await assert.rejects(
  () => fetchCompleteCatalog({
    client: duplicateClient,
    table: "public_event_discovery",
    orderColumn: "edition_id"
  }),
  error => error.code === "CATALOG_DUPLICATE_CURSOR"
);

const legacyRows = Array.from({ length: 12 }, (_value, index) => ({
  id: index + 1,
  status: index % 3 === 0 ? "pending" : "approved"
}));
const legacyClient = createFakeClient(legacyRows);
const legacyCatalog = await fetchCompleteCatalog({
  client: legacyClient,
  table: "events",
  orderColumn: "id",
  pageSize: 3,
  applyFilters(query) {
    return query.eq("status", "approved");
  }
});

assert.equal(legacyCatalog.count, 8);
assert.equal(legacyCatalog.rows.length, 8);
assert.equal(
  legacyCatalog.rows.every(row => row.status === "approved"),
  true
);

const failedClient = createFakeClient(largeRows, {
  failTable: "public_event_discovery",
  failMessage: "public_event_discovery is unavailable"
});

await assert.rejects(
  () => fetchCompleteCatalog({
    client: failedClient,
    table: "public_event_discovery",
    orderColumn: "edition_id"
  }),
  error =>
    error.code === "CATALOG_QUERY_FAILED" &&
    /public_event_discovery/.test(error.message)
);

const fallbackRows = [
  { event_name: "Past event", date: "11.08.2026" },
  { event_name: "Today event", date: "12.08.2026" },
  { event_name: "Future event", date: "2026-08-13" },
  { event_name: "Invalid event", date: "31.02.2027" },
  { event_name: "Missing date" }
];
const currentFallbackRows = filterCurrentCatalogRows(fallbackRows, {
  today: "2026-08-12"
});

assert.deepEqual(
  currentFallbackRows.map(row => row.event_name),
  ["Today event", "Future event"]
);
assert.equal(fallbackRows.length, 5);
assert.throws(
  () => filterCurrentCatalogRows([], { today: "not-a-date" }),
  error => error.code === "CATALOG_REFERENCE_DATE_INVALID"
);

console.log(
  "Event catalog loader verified: complete cursor pagination, server response " +
  "caps, exact counts, legacy filters, fresh fallbacks and incomplete-response " +
  "protection."
);
