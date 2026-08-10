import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WorldTriathlonEvent = {
  event_id?: number;
  event_title?: string;
  event_venue?: string;
  event_country?: string;
  event_latitude?: number | string;
  event_longitude?: number | string;
  event_date?: string;
  event_listing?: string;
  event_api_listing?: string;
};

type AppEvent = {
  event_name: string;
  sport: "Triathlon";
  date: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  distance: string;
  event_url: string;
  status: "pending";
  created_by?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function readKeyDictionary(name: string) {
  try {
    return JSON.parse(Deno.env.get(name) || "{}");
  } catch {
    return {};
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    }
  );
}

function cleanValue(value: unknown) {
  return String(value || "").trim();
}

function parseCoordinate(value: unknown) {
  const numberValue =
    Number(value);

  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  return null;
}

function formatDate(date: string) {
  const [year, month, day] =
    cleanValue(date).split("-");

  if (!year || !month || !day) {
    return "";
  }

  return `${day}.${month}.${year}`;
}

function getEventsFromResponse(payload: unknown): WorldTriathlonEvent[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (
    payload &&
    typeof payload === "object"
  ) {
    const response =
      payload as Record<string, unknown>;

    if (Array.isArray(response.data)) {
      return response.data as WorldTriathlonEvent[];
    }

    if (Array.isArray(response.events)) {
      return response.events as WorldTriathlonEvent[];
    }
  }

  return [];
}

function normalizeWorldTriathlonEvent(
  event: WorldTriathlonEvent,
  userId?: string
): AppEvent | null {
  const eventName =
    cleanValue(event.event_title);

  const date =
    formatDate(cleanValue(event.event_date));

  if (!eventName || !date) {
    return null;
  }

  const normalized: AppEvent = {
    event_name: eventName,
    sport: "Triathlon",
    date,
    city: cleanValue(event.event_venue),
    country: cleanValue(event.event_country),
    latitude: parseCoordinate(event.event_latitude),
    longitude: parseCoordinate(event.event_longitude),
    distance: "Triathlon",
    event_url:
      cleanValue(event.event_listing) ||
      cleanValue(event.event_api_listing),
    status: "pending"
  };

  if (userId) {
    normalized.created_by = userId;
  }

  return normalized;
}

async function fetchWorldTriathlonEvents(
  apiKey: string,
  startDate: string,
  endDate: string
) {
  const url =
    new URL("https://api.triathlon.org/v1/events");

  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("order", "asc");

  const response =
    await fetch(
      url,
      {
        headers: {
          apikey: apiKey
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `World Triathlon API returned ${response.status}`
    );
  }

  return await response.json();
}

async function removeExistingEvents(
  supabaseAdmin: ReturnType<typeof createClient>,
  importedEvents: AppEvent[]
) {
  const filteredEvents: AppEvent[] = [];
  const duplicates: AppEvent[] = [];

  for (const event of importedEvents) {
    const { data, error } =
      await supabaseAdmin
        .from("events")
        .select("id")
        .eq("event_name", event.event_name)
        .eq("date", event.date)
        .eq("city", event.city)
        .eq("country", event.country)
        .eq("sport", event.sport)
        .limit(1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      duplicates.push(event);
    }
    else {
      filteredEvents.push(event);
    }
  }

  return {
    filteredEvents,
    duplicates
  };
}

Deno.serve(async request => {
  try {
    if (request.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        {
          error: "Method not allowed"
        },
        405
      );
    }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

  const publishableKeys =
    readKeyDictionary("SUPABASE_PUBLISHABLE_KEYS");

  const supabasePublishableKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    publishableKeys.default ||
    "";

  const secretKeys =
    readKeyDictionary("SUPABASE_SECRET_KEYS");

  const supabaseSecretKey =
    Deno.env.get("SUPABASE_SECRET_KEY") ||
    secretKeys.default ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    "";

  const worldTriathlonApiKey =
    Deno.env.get("WORLD_TRIATHLON_API_KEY");

  if (
    !supabaseUrl ||
    !supabasePublishableKey ||
    !supabaseSecretKey ||
    !worldTriathlonApiKey
  ) {
    return jsonResponse(
      {
        error: "Missing required environment variables"
      },
      500
    );
  }

  const authorization =
    request.headers.get("Authorization") || "";

  const supabaseUserClient =
    createClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        global: {
          headers: {
            Authorization: authorization
          }
        }
      }
    );

  const {
    data: { user },
    error: userError
  } = await supabaseUserClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse(
      {
        error: "Login required"
      },
      401
    );
  }

  const body =
    await request.json().catch(() => ({}));

  const startDate =
    cleanValue(body.start_date) ||
    new Date().toISOString().slice(0, 10);

  const endDate =
    cleanValue(body.end_date) ||
    `${new Date().getFullYear() + 1}-12-31`;

  const save =
    body.save === true;

  const rawPayload =
    await fetchWorldTriathlonEvents(
      worldTriathlonApiKey,
      startDate,
      endDate
    );

  const importedEvents =
    getEventsFromResponse(rawPayload)
      .map(event =>
        normalizeWorldTriathlonEvent(
          event,
          user.id
        )
      )
      .filter(
        (event): event is AppEvent =>
          Boolean(event)
      );

  if (!save) {
    return jsonResponse({
      mode: "preview",
      source: "World Triathlon",
      count: importedEvents.length,
      events: importedEvents
    });
  }

  const supabaseAdmin =
    createClient(
      supabaseUrl,
      supabaseSecretKey
    );

  const {
    filteredEvents,
    duplicates
  } = await removeExistingEvents(
    supabaseAdmin,
    importedEvents
  );

  if (filteredEvents.length > 0) {
    const { error } =
      await supabaseAdmin
        .from("events")
        .insert(filteredEvents);

    if (error) {
      throw error;
    }
  }

    return jsonResponse({
      mode: "saved",
      source: "World Triathlon",
      imported: filteredEvents.length,
      duplicates: duplicates.length,
      status: "pending"
    });
  }
  catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected import error"
      },
      500
    );
  }
});
