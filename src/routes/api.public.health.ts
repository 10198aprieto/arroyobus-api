import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, Origin",
  "Access-Control-Max-Age": "86400",
};

type CheckStatus = "ok" | "degraded" | "down";

interface Check {
  id: string;
  group: "gtfs-rt" | "gtfs-static" | "api" | "actiosae";
  name: string;
  url: string;
  status: CheckStatus;
  http_status: number | null;
  latency_ms: number;
  entities?: number;
  age_seconds?: number | null;
  note?: string;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://enzeyiwpoomhlxmcjivn.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

const TIMEOUT_MS = 8000;

async function timedFetch(url: string, init?: RequestInit) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { res, latency: Date.now() - started, error: null as string | null };
  } catch (err) {
    return {
      res: null,
      latency: Date.now() - started,
      error: err instanceof Error ? err.message : "fetch error",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** GTFS-RT feed: parsed via its ?format=json debug view. */
async function checkRealtime(
  id: string,
  name: string,
  fn: string,
): Promise<Check> {
  const url = `${SUPABASE_URL}/functions/v1/${fn}?format=json`;
  const { res, latency, error } = await timedFetch(url, {
    headers: SUPABASE_KEY
      ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      : {},
  });

  const base: Check = {
    id,
    group: "gtfs-rt",
    name,
    url: `${SUPABASE_URL}/functions/v1/${fn}`,
    status: "down",
    http_status: res?.status ?? null,
    latency_ms: latency,
  };

  if (!res) return { ...base, note: error ?? "sin respuesta" };
  if (!res.ok) return { ...base, note: `HTTP ${res.status}` };

  type RtBody = { header?: { timestamp?: number | string }; entity?: unknown[] };
  let body: RtBody | null = null;
  try {
    body = (await res.json()) as RtBody;
  } catch {
    return { ...base, status: "degraded", note: "respuesta no parseable" };
  }

  const entities = Array.isArray(body?.entity) ? body.entity.length : 0;
  const ts = Number(body?.header?.timestamp ?? 0);
  const age = ts > 0 ? Math.max(0, Math.floor(Date.now() / 1000) - ts) : null;

  return {
    ...base,
    status: entities > 0 ? "ok" : "degraded",
    entities,
    age_seconds: age,
    note:
      entities > 0
        ? undefined
        : "feed activo pero sin entidades (los vehículos no reportan GPS ahora mismo)",
  };
}

async function checkUrl(
  id: string,
  group: Check["group"],
  name: string,
  url: string,
  init?: RequestInit,
): Promise<Check> {
  const { res, latency, error } = await timedFetch(url, { method: "GET", ...init });
  if (!res) {
    return {
      id,
      group,
      name,
      url,
      status: "down",
      http_status: null,
      latency_ms: latency,
      note: error ?? "sin respuesta",
    };
  }
  return {
    id,
    group,
    name,
    url,
    status: res.ok ? "ok" : "down",
    http_status: res.status,
    latency_ms: latency,
    note: res.ok ? undefined : `HTTP ${res.status}`,
  };
}

async function checkActio(
  id: string,
  name: string,
  path: string,
  expectKey: string,
): Promise<Check> {
  const url = `${SUPABASE_URL}/functions/v1/actio?path=${encodeURIComponent(path)}`;
  const { res, latency, error } = await timedFetch(url, {
    headers: SUPABASE_KEY
      ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      : {},
  });

  const base: Check = {
    id,
    group: "actiosae",
    name,
    url,
    status: "down",
    http_status: res?.status ?? null,
    latency_ms: latency,
  };
  if (!res) return { ...base, note: error ?? "sin respuesta" };
  if (!res.ok) return { ...base, note: `HTTP ${res.status}` };

  let payload: Record<string, unknown> | null = null;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ...base, status: "degraded", note: "respuesta no parseable" };
  }

  const value = payload?.[expectKey];
  const count = Array.isArray(value) ? value.length : 0;
  return {
    ...base,
    status: count > 0 ? "ok" : "degraded",
    entities: count,
    note: count > 0 ? undefined : `upstream sin datos en "${expectKey}"`,
  };
}

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const started = Date.now();

        const checks = await Promise.all([
          // GTFS-Realtime (los 3 feeds)
          checkRealtime("gtfs-rt-vehicle-positions", "VehiclePositions", "gtfs-rt"),
          checkRealtime("gtfs-rt-trip-updates", "TripUpdates", "gtfs-rt-trip-updates"),
          checkRealtime("gtfs-rt-alerts", "ServiceAlerts", "gtfs-rt-alerts"),

          // GTFS estático propio
          checkUrl("gtfs-static-zip", "gtfs-static", "GTFS estático (zip)", `${origin}/gtfs-static.zip`, { method: "HEAD" }),
          checkUrl("gtfs-static-stops", "gtfs-static", "stops.txt", `${origin}/gtfs/stops.txt`, { method: "HEAD" }),
          checkUrl("gtfs-static-trips", "gtfs-static", "trips.txt", `${origin}/gtfs/trips.txt`, { method: "HEAD" }),

          // API propia
          checkUrl("api-gtfs-static-routes", "api", "API GTFS estático (routes)", `${origin}/api/public/gtfs-static/routes`),
          checkUrl("api-alerts", "api", "API de incidencias", `${origin}/api/public/alerts`),
          checkUrl("api-ads", "api", "API de publicidad", `${origin}/api/public/ads`),

          // ActioSAE (upstream vía proxy)
          checkActio("actio-routes", "ActioSAE route/list", "route/list", "routes"),
          checkActio("actio-stops", "ActioSAE stop/list", "stop/list", "stops"),
          checkActio("actio-vehicles", "ActioSAE vehiclePosition", "vehiclePosition", "gpsPositions"),
          checkActio("actio-alerts", "ActioSAE alert/list", "alert/list", "alerts"),
          checkUrl("actio-gtfs", "actiosae", "GTFS reconstruido de ActioSAE", `${origin}/api/public/actiosae/gtfs/routes.txt`, { method: "HEAD" }),
        ]);

        const down = checks.filter((c) => c.status === "down").length;
        const degraded = checks.filter((c) => c.status === "degraded").length;
        const overall: CheckStatus = down > 0 ? "down" : degraded > 0 ? "degraded" : "ok";

        const body = {
          status: overall,
          generated_at: new Date().toISOString(),
          took_ms: Date.now() - started,
          summary: {
            total: checks.length,
            ok: checks.length - down - degraded,
            degraded,
            down,
          },
          policy: {
            cors: {
              allow_origin: "*",
              allow_methods: ["GET", "HEAD", "OPTIONS"],
              allow_headers: ["Content-Type", "Authorization", "Accept", "Origin"],
              max_age_seconds: 86400,
              credentials: false,
            },
            rate_limit: {
              enforced: false,
              fair_use_requests_per_minute: 120,
              realtime_min_poll_seconds: 1,
              static_min_poll_seconds: 3600,
              note: "Sin límite duro, pero se pide uso razonable: máx. ~120 req/min por IP, GTFS-RT como mucho 1 req/s y GTFS estático como mucho 1 vez por hora. El abuso puede bloquearse.",
            },
          },
          checks,
        };

        return new Response(JSON.stringify(body, null, 2), {
          status: overall === "down" ? 503 : 200,
          headers: {
            ...CORS,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Health-Status": overall,
          },
        });
      },
    },
  },
});
