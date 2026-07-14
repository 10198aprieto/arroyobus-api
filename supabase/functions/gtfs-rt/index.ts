// GTFS-Realtime VehiclePositions feed for Arroyo de la Encomienda.
//
// The upstream `/bff/mobile/vehiclePosition` endpoint returns an empty list,
// but each entry in `/bff/mobile/arrivals/{stopId}` carries the assigned
// vehicle's lat/lon/gpsTimestamp. We fan out across every stop, dedupe by
// vehicleId, and keep the most recent GPS sample per vehicle.
//
// GET /functions/v1/gtfs-rt              -> application/x-protobuf (GTFS-RT)
// GET /functions/v1/gtfs-rt?format=json  -> JSON debug

const BASE = "https://arroyo.actiosae.com";
const API_KEY = "AIzaSyCvtaF21g0lPX0cTgOiIcHZNZRQlw2TRVA";
const ANDROID_PACKAGE = "com.geoactio.arroyo_encomienda";
const ANDROID_CERT_SHA1 = "222E5B204DE7B52F04DBED2A8B7947D566B0C2CA";
const FEED_ID = "arroyo";
const FEED_TTL_MS = 2_000;
const STOPS_TTL_MS = 5 * 60_000;
const FANOUT_CONCURRENCY = 3;
const VEHICLE_SAMPLE_STOP_IDS = ["1", "12", "22", "43", "60", "10", "20", "29", "50", "33"];

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface Stop { stopId: string; }
interface Arrival {
  tripId?: string;
  stopId?: string;
  stopSequence?: string | number;
  directionId?: string | number;
  vehicleId?: string | null;
  lat?: number;
  lon?: number;
  gpsTimestamp?: string;
  isAproximated?: boolean;
  route?: { routeId?: string };
}

interface VehicleSample {
  vehicleId: string;
  lat: number;
  lon: number;
  ts: number;
  tripId?: string;
  routeId?: string;
  directionId?: string | number;
  stopId?: string;
  stopSequence?: string | number;
  isAproximated?: boolean;
}

// ---------- tiny protobuf writer ----------
class PbWriter {
  private chunks: number[] = [];
  bytes(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
  private writeVarint(v: number) {
    let n = v >>> 0;
    while (n > 0x7f) {
      this.chunks.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    this.chunks.push(n & 0x7f);
  }
  private writeVarint64(v: number) {
    // Encode an unsigned integer up to 2^53 as varint.
    let lo = v >>> 0;
    let hi = Math.floor(v / 0x100000000) >>> 0;
    while (hi > 0 || lo > 0x7f) {
      this.chunks.push((lo & 0x7f) | 0x80);
      const carry = (hi & 0x7f) << 25;
      lo = ((lo >>> 7) | carry) >>> 0;
      hi >>>= 7;
    }
    this.chunks.push(lo & 0x7f);
  }
  tagVarint(field: number, value: number) {
    this.writeVarint((field << 3) | 0);
    if (value > 0xffffffff) this.writeVarint64(value);
    else this.writeVarint(value);
  }
  tagFloat(field: number, value: number) {
    this.writeVarint((field << 3) | 5);
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    const arr = new Uint8Array(buf);
    this.chunks.push(arr[0], arr[1], arr[2], arr[3]);
  }
  tagString(field: number, value: string) {
    this.writeVarint((field << 3) | 2);
    const bytes = new TextEncoder().encode(value);
    this.writeVarint(bytes.length);
    for (const b of bytes) this.chunks.push(b);
  }
  tagMessage(field: number, sub: Uint8Array) {
    this.writeVarint((field << 3) | 2);
    this.writeVarint(sub.length);
    for (const b of sub) this.chunks.push(b);
  }
}

function encodePosition(s: VehicleSample): Uint8Array {
  const w = new PbWriter();
  w.tagFloat(1, s.lat);
  w.tagFloat(2, s.lon);
  return w.bytes();
}

function encodeTripDescriptor(s: VehicleSample): Uint8Array | null {
  if (!s.tripId && !s.routeId && s.directionId === undefined) return null;
  const w = new PbWriter();
  if (s.tripId) w.tagString(1, s.tripId); // trip_id
  if (s.routeId) w.tagString(5, s.routeId); // route_id
  if (s.directionId !== undefined && s.directionId !== null) {
    const n = Number(s.directionId);
    if (!Number.isNaN(n)) w.tagVarint(6, n);
  }
  return w.bytes();
}

function encodeVehicleDescriptor(id: string): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, id); // id
  w.tagString(2, id); // label
  return w.bytes();
}

function encodeStopRef(s: VehicleSample, w: PbWriter) {
  if (s.stopId) w.tagString(7, s.stopId); // stop_id
  if (s.stopSequence !== undefined) {
    const n = Number(s.stopSequence);
    if (!Number.isNaN(n)) w.tagVarint(3, n); // current_stop_sequence
  }
}

function encodeVehiclePosition(s: VehicleSample): Uint8Array {
  const w = new PbWriter();
  const trip = encodeTripDescriptor(s);
  if (trip) w.tagMessage(1, trip);
  w.tagMessage(2, encodePosition(s));
  encodeStopRef(s, w);
  w.tagVarint(5, s.ts); // timestamp
  w.tagMessage(8, encodeVehicleDescriptor(s.vehicleId));
  return w.bytes();
}

function encodeFeedEntity(id: string, vp: Uint8Array): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, id); // id
  w.tagMessage(4, vp); // vehicle
  return w.bytes();
}

function encodeFeedHeader(ts: number): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, "2.0"); // gtfs_realtime_version
  w.tagVarint(2, 0); // incrementality = FULL_DATASET
  w.tagVarint(3, ts); // timestamp
  return w.bytes();
}

function encodeFeedMessage(samples: VehicleSample[], feedTs: number): Uint8Array {
  const w = new PbWriter();
  w.tagMessage(1, encodeFeedHeader(feedTs));
  for (const s of samples) {
    w.tagMessage(2, encodeFeedEntity(s.vehicleId, encodeVehiclePosition(s)));
  }
  return w.bytes();
}

function parseTimestamp(s?: string): number | null {
  if (!s) return null;
  // Try ISO first, then numeric seconds/ms.
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return Math.floor(t / 1000);
  const n = Number(s);
  if (!Number.isNaN(n)) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  return null;
}

// ---------- upstream fetch ----------
const upHeaders = {
  "X-Android-Package": ANDROID_PACKAGE,
  "X-Android-Cert": ANDROID_CERT_SHA1,
  "Accept": "application/json",
};

let stopsCache: { at: number; ids: string[] } | null = null;
async function fetchStopIds(): Promise<string[]> {
  // The upstream stop/list endpoint rate-limits aggressively (429). These
  // representative high-traffic stops expose all active vehicle assignments
  // while keeping the realtime feed fast and reliable.
  if (!stopsCache) stopsCache = { at: Date.now(), ids: VEHICLE_SAMPLE_STOP_IDS };
  if (stopsCache && Date.now() - stopsCache.at < STOPS_TTL_MS) return stopsCache.ids;
  const u = new URL(`${BASE}/bff/mobile/stop/list`);
  u.searchParams.set("feedId", FEED_ID);
  u.searchParams.set("key", API_KEY);
  const r = await fetch(u, { headers: upHeaders });
  if (!r.ok) return VEHICLE_SAMPLE_STOP_IDS;
  const json = await r.json();
  const ids = ((json.stops as Stop[]) ?? []).map((s) => s.stopId);
  stopsCache = { at: Date.now(), ids };
  return ids;
}

async function fetchArrivals(stopId: string): Promise<Arrival[]> {
  const u = new URL(`${BASE}/bff/mobile/arrivals/${encodeURIComponent(stopId)}`);
  u.searchParams.set("feedId", FEED_ID);
  u.searchParams.set("key", API_KEY);
  const r = await fetch(u, { headers: upHeaders });
  if (!r.ok) return [];
  const json = await r.json().catch(() => []);
  return Array.isArray(json) ? (json as Arrival[]) : [];
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try { out[idx] = await fn(items[idx]); } catch { out[idx] = [] as unknown as R; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

let feedCache: { at: number; samples: VehicleSample[] } | null = null;
async function buildSamples(): Promise<VehicleSample[]> {
  if (feedCache && Date.now() - feedCache.at < FEED_TTL_MS) return feedCache.samples;
  const stopIds = await fetchStopIds();
  const all = await pool(stopIds, FANOUT_CONCURRENCY, fetchArrivals);
  const best = new Map<string, VehicleSample>();
  for (const arrivals of all) {
    for (const a of arrivals) {
      if (!a.vehicleId) continue;
      if (typeof a.lat !== "number" || typeof a.lon !== "number") continue;
      const ts = parseTimestamp(a.gpsTimestamp);
      if (ts === null) continue;
      const cur = best.get(a.vehicleId);
      if (cur && cur.ts >= ts) continue;
      best.set(a.vehicleId, {
        vehicleId: a.vehicleId,
        lat: a.lat,
        lon: a.lon,
        ts,
        tripId: a.tripId,
        routeId: a.route?.routeId,
        directionId: a.directionId,
        stopId: a.stopId,
        stopSequence: a.stopSequence,
        isAproximated: a.isAproximated,
      });
    }
  }
  const samples = [...best.values()];
  feedCache = { at: Date.now(), samples };
  return samples;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    const samples = await buildSamples();
    const feedTs = Math.floor(Date.now() / 1000);

    if (format === "json") {
      return new Response(
        JSON.stringify({
          header: {
            gtfs_realtime_version: "2.0",
            incrementality: "FULL_DATASET",
            timestamp: feedTs,
          },
          entity: samples.map((s) => ({
            id: s.vehicleId,
            vehicle: {
              trip: { trip_id: s.tripId, route_id: s.routeId, direction_id: s.directionId },
              position: { latitude: s.lat, longitude: s.lon },
              current_stop_sequence: s.stopSequence,
              stop_id: s.stopId,
              timestamp: s.ts,
              vehicle: { id: s.vehicleId, label: s.vehicleId },
              is_approximated: s.isAproximated,
            },
          })),
        }, null, 2),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=1",
          },
        },
      );
    }

    const pb = encodeFeedMessage(samples, feedTs);
    return new Response(pb, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-protobuf",
        "Content-Disposition": 'inline; filename="vehicle-positions.pb"',
        "Cache-Control": "public, max-age=1",
        "X-Vehicle-Count": String(samples.length),
        "X-Feed-Timestamp": String(feedTs),
        "X-Upstream-Status": samples.length === 0 ? "no-vehicles-assigned" : "ok",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("gtfs-rt error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});