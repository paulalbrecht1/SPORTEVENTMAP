(function initializeEventCatalogLoader(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.EventCatalogLoader = api;
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function createEventCatalogLoader() {
    const DEFAULT_PAGE_SIZE = 500;
    const MAX_PAGE_SIZE = 1000;
    const DEFAULT_MAX_ROWS = 100000;

    function createCatalogError(code, message, cause = null) {
      const error = new Error(message);
      error.name = "EventCatalogError";
      error.code = code;

      if (cause) {
        error.cause = cause;
      }

      return error;
    }

    function getCursorKey(value) {
      if (value === null || value === undefined || value === "") {
        return "";
      }

      return `${typeof value}:${String(value)}`;
    }

    function parseCatalogDate(value) {
      const text = String(value || "").trim();
      const germanMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
      const parts = germanMatch
        ? [germanMatch[3], germanMatch[2], germanMatch[1]]
        : isoMatch
          ? [isoMatch[1], isoMatch[2], isoMatch[3]]
          : null;

      if (!parts) {
        return null;
      }

      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      const timestamp = Date.UTC(year, month - 1, day);
      const parsed = new Date(timestamp);

      if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
      ) {
        return null;
      }

      return timestamp;
    }

    function getLocalDateTimestamp(value) {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return Date.UTC(
          value.getFullYear(),
          value.getMonth(),
          value.getDate()
        );
      }

      return parseCatalogDate(value);
    }

    function filterCurrentCatalogRows(rows, { today = new Date() } = {}) {
      if (!Array.isArray(rows)) {
        throw createCatalogError(
          "CATALOG_ROWS_INVALID",
          "Catalog rows must be provided as an array."
        );
      }

      const todayTimestamp = getLocalDateTimestamp(today);

      if (todayTimestamp === null) {
        throw createCatalogError(
          "CATALOG_REFERENCE_DATE_INVALID",
          "A valid catalog reference date is required."
        );
      }

      return rows.filter(row => {
        const eventTimestamp = parseCatalogDate(row && row.date);
        return eventTimestamp !== null && eventTimestamp >= todayTimestamp;
      });
    }

    async function fetchCompleteCatalog({
      client,
      table,
      select = "*",
      orderColumn,
      applyFilters,
      pageSize = DEFAULT_PAGE_SIZE,
      maxRows = DEFAULT_MAX_ROWS
    } = {}) {
      if (!client || typeof client.from !== "function") {
        throw createCatalogError(
          "CATALOG_CLIENT_MISSING",
          "A Supabase client is required to load the event catalog."
        );
      }

      if (!table || !orderColumn) {
        throw createCatalogError(
          "CATALOG_CONFIGURATION_INVALID",
          "Catalog table and stable order column are required."
        );
      }

      if (
        !Number.isInteger(pageSize) ||
        pageSize < 1 ||
        pageSize > MAX_PAGE_SIZE
      ) {
        throw createCatalogError(
          "CATALOG_PAGE_SIZE_INVALID",
          `Catalog page size must be between 1 and ${MAX_PAGE_SIZE}.`
        );
      }

      if (!Number.isInteger(maxRows) || maxRows < pageSize) {
        throw createCatalogError(
          "CATALOG_MAX_ROWS_INVALID",
          "Catalog safety limit must be an integer at least as large as one page."
        );
      }

      const rows = [];
      const seenCursors = new Set();
      let cursor = null;
      let expectedCount = null;
      let pageCount = 0;

      while (true) {
        let query = client
          .from(table)
          .select(
            select,
            expectedCount === null
              ? { count: "exact" }
              : {}
          );

        if (typeof applyFilters === "function") {
          query = applyFilters(query);
        }

        if (cursor !== null) {
          query = query.gt(orderColumn, cursor);
        }

        query = query
          .order(orderColumn, { ascending: true })
          .limit(pageSize);

        const result = await query;
        pageCount += 1;

        if (result && result.error) {
          throw createCatalogError(
            "CATALOG_QUERY_FAILED",
            `Supabase catalog query failed for ${table}: ${result.error.message || result.error}`,
            result.error
          );
        }

        const pageRows = Array.isArray(result && result.data)
          ? result.data
          : [];

        if (expectedCount === null) {
          if (!Number.isInteger(result && result.count) || result.count < 0) {
            throw createCatalogError(
              "CATALOG_COUNT_MISSING",
              `Supabase did not return an exact visible row count for ${table}.`
            );
          }

          expectedCount = result.count;

          if (expectedCount > maxRows) {
            throw createCatalogError(
              "CATALOG_SAFETY_LIMIT_EXCEEDED",
              `Catalog count ${expectedCount} exceeds the configured safety limit of ${maxRows} rows.`
            );
          }
        }

        for (const row of pageRows) {
          const cursorValue = row && row[orderColumn];
          const cursorKey = getCursorKey(cursorValue);

          if (!cursorKey) {
            throw createCatalogError(
              "CATALOG_CURSOR_MISSING",
              `Catalog row is missing stable cursor column ${orderColumn}.`
            );
          }

          if (seenCursors.has(cursorKey)) {
            throw createCatalogError(
              "CATALOG_DUPLICATE_CURSOR",
              `Catalog cursor ${cursorValue} was returned more than once.`
            );
          }

          seenCursors.add(cursorKey);
          rows.push(row);
        }

        if (rows.length > maxRows) {
          throw createCatalogError(
            "CATALOG_SAFETY_LIMIT_EXCEEDED",
            `Catalog exceeded the configured safety limit of ${maxRows} rows.`
          );
        }

        if (rows.length > expectedCount) {
          throw createCatalogError(
            "CATALOG_COUNT_CHANGED",
            `Catalog grew while loading: expected ${expectedCount}, received at least ${rows.length}.`
          );
        }

        if (rows.length === expectedCount) {
          break;
        }

        // A Supabase project can cap responses below the requested page size.
        // Any non-empty page with an advancing cursor is still safe to follow.
        if (pageRows.length === 0) {
          throw createCatalogError(
            "CATALOG_INCOMPLETE",
            `Catalog response was incomplete: expected ${expectedCount}, received ${rows.length}.`
          );
        }

        const nextCursor = pageRows[pageRows.length - 1][orderColumn];

        if (getCursorKey(nextCursor) === getCursorKey(cursor)) {
          throw createCatalogError(
            "CATALOG_CURSOR_STALLED",
            `Catalog cursor did not advance beyond ${nextCursor}.`
          );
        }

        cursor = nextCursor;
      }

      return {
        rows,
        count: expectedCount,
        pages: pageCount,
        orderColumn
      };
    }

    return Object.freeze({
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
      filterCurrentCatalogRows,
      fetchCompleteCatalog
    });
  }
);
