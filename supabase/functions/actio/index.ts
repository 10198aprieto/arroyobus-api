// Generic proxy to the Arroyobus upstream BFF.
//
// GET  /functions/v1/actio?path=route/list                   -> JSON
// GET  /functions/v1/actio?path=stop/list
// GET  /functions/v1/actio?path=stopInfo/{id}
// GET  /functions/v1/actio?path=arrivals/{id}
// GET  /functions/v1/actio?path=vehiclePosition
// GET  /functions/v1/actio?path=alert/list
// POST /functions/v1/actio?path=transportation-request/send  body=JSON
// POST /functions/v1/actio?path=v1.1/send-suggestion         body=JSON

const BASE = "https://arroyo.actiosae.com";
const API_KEY = "AIzaSyCvtaF21g0lPX0cTgOiIcHZNZRQlw2TRVA";
const ANDROID_PACKAGE = "com.geoactio.arroyo_encomienda";
const ANDROID_CERT_SHA1 = "222E5B204DE7B52F04DBED2A8B7947D566B0C2CA";
const FEED_ID = "arroyo";

const ALLOWED = new Set([
  "route/list",
  "stop/list",
  "alert/list",
  "vehiclePosition",
]);
const ALLOWED_PREFIX = ["stopInfo/", "arrivals/"];
const ALLOWED_POST = new Set([
  "transportation-request/send",
  "v1.1/send-suggestion",
]);

const VEHICLE_SAMPLE_STOP_IDS = ["1", "12", "22", "43", "60", "10", "20", "29", "50", "33"];
const VEHICLE_CACHE_MS = 2_000;

interface ArrivalWithVehicle {
  vehicleId?: string | null;
  lat?: number;
  lon?: number;
  gpsTimestamp?: string;
  tripId?: string;
  stopId?: string;
  stopName?: string;
  stopSequence?: string | number;
  directionId?: string | number;
  route?: { routeId?: string; routeShortName?: string; color?: string };
}

interface VehiclePosition {
  vehicleId: string;
  lat: number;
  lon: number;
  latitude: number;
  longitude: number;
  gpsTimestamp?: string;
  timestamp?: string;
  timestampSeconds?: number;
  tripId?: string;
  routeId?: string;
  routeShortName?: string;
  routeColor?: string;
  stopId?: string;
  stopName?: string;
  stopSequence?: string | number;
  directionId?: string | number;
  source: "reconstructed-arrivals";
}

let vehicleCache: { at: number; positions: VehiclePosition[] } | null = null;

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function pathAllowed(p: string, method: string): boolean {
  if (method === "POST") return ALLOWED_POST.has(p);
  if (ALLOWED.has(p)) return true;
  return ALLOWED_PREFIX.some((pre) => p.startsWith(pre) && p.length > pre.length);
}

function parseTimestampSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  return undefined;
}

async function fetchArrivalsForVehicles(stopId: string): Promise<ArrivalWithVehicle[]> {
  const upstream = new URL(`${BASE}/bff/mobile/arrivals/${encodeURIComponent(stopId)}`);
  upstream.searchParams.set("feedId", FEED_ID);
  upstream.searchParams.set("key", API_KEY);
  const r = await fetch(upstream, {
    headers: {
      "X-Android-Package": ANDROID_PACKAGE,
      "X-Android-Cert": ANDROID_CERT_SHA1,
      "Accept": "application/json",
    },
  });
  if (!r.ok) return [];
  const json = await r.json().catch(() => []);
  return Array.isArray(json) ? json as ArrivalWithVehicle[] : [];
}

async function pooled<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { out[index] = await fn(items[index]); } catch { out[index] = [] as R; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

async function buildVehiclePositions(): Promise<VehiclePosition[]> {
  if (vehicleCache && Date.now() - vehicleCache.at < VEHICLE_CACHE_MS) return vehicleCache.positions;
  const arrivalsByStop = await pooled(VEHICLE_SAMPLE_STOP_IDS, 3, fetchArrivalsForVehicles);
  const best = new Map<string, VehiclePosition>();
  for (const arrivals of arrivalsByStop) {
    for (const arrival of arrivals) {
      if (!arrival.vehicleId || typeof arrival.lat !== "number" || typeof arrival.lon !== "number") continue;
      const timestampSeconds = parseTimestampSeconds(arrival.gpsTimestamp);
      const current = best.get(arrival.vehicleId);
      if (current?.timestampSeconds && timestampSeconds && current.timestampSeconds >= timestampSeconds) continue;
      best.set(arrival.vehicleId, {
        vehicleId: arrival.vehicleId,
        lat: arrival.lat,
        lon: arrival.lon,
        latitude: arrival.lat,
        longitude: arrival.lon,
        gpsTimestamp: arrival.gpsTimestamp,
        timestamp: arrival.gpsTimestamp,
        timestampSeconds,
        tripId: arrival.tripId,
        routeId: arrival.route?.routeId,
        routeShortName: arrival.route?.routeShortName,
        routeColor: arrival.route?.color,
        stopId: arrival.stopId,
        stopName: arrival.stopName,
        stopSequence: arrival.stopSequence,
        directionId: arrival.directionId,
        source: "reconstructed-arrivals",
      });
    }
  }
  const positions = [...best.values()].sort((a, b) => a.vehicleId.localeCompare(b.vehicleId));
  vehicleCache = { at: Date.now(), positions };
  return positions;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const path = (url.searchParams.get("path") ?? "").replace(/^\/+/, "");
  if (!path || !pathAllowed(path, req.method)) {
    return new Response(JSON.stringify({ error: "invalid path", path }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const upstream = new URL(`${BASE}/bff/mobile/${path}`);
  upstream.searchParams.set("feedId", FEED_ID);
  upstream.searchParams.set("key", API_KEY);
  // forward additional query params (except `path`)
  for (const [k, v] of url.searchParams) {
    if (k !== "path" && k !== "feedId" && k !== "key") upstream.searchParams.set(k, v);
  }

  const headers: Record<string, string> = {
    "X-Android-Package": ANDROID_PACKAGE,
    "X-Android-Cert": ANDROID_CERT_SHA1,
    "Accept": "application/json",
  };

  const init: RequestInit = { method: req.method, headers };
  if (req.method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = await req.text();
  }

  try {
    const r = await fetch(upstream, init);
    const body = await r.text();
    if (path === "vehiclePosition") {
      let parsed: { gpsPositions?: unknown[]; message?: string } | null = null;
      try { parsed = JSON.parse(body); } catch { parsed = null; }
      if (!r.ok || !parsed?.gpsPositions?.length) {
        const positions = await buildVehiclePositions();
        return new Response(JSON.stringify({
          gpsPositions: positions,
          message: positions.length
            ? "vehiclePosition reconstruido desde arrivals porque el endpoint nativo viene vacío"
            : parsed?.message ?? "Sin vehículos activos detectados",
          native: parsed ?? body,
        }), {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=1",
          },
        });
      }
    }
    return new Response(body, {
      status: r.status,
      headers: {
        ...cors,
        "Content-Type": r.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": req.method === "GET" ? "public, max-age=1" : "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "upstream error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});