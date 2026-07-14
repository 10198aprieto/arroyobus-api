// GTFS-Realtime TripUpdates feed for Arroyo de la Encomienda.
//
// Builds a FeedMessage with one TripUpdate per active trip by:
//   1. Listing stops once (cached 5 min).
//   2. Fan-out `bff/mobile/arrivals/{stopId}` for every stop (parallel).
//   3. Aggregating arrivals by tripId, ordering by stopSequence.
//
// GET  /functions/v1/gtfs-rt-trip-updates              -> application/x-protobuf
// GET  /functions/v1/gtfs-rt-trip-updates?format=json  -> JSON debug

const BASE = "https://arroyo.actiosae.com";
const API_KEY = "AIzaSyCvtaF21g0lPX0cTgOiIcHZNZRQlw2TRVA";
const ANDROID_PACKAGE = "com.geoactio.arroyo_encomienda";
const ANDROID_CERT_SHA1 = "222E5B204DE7B52F04DBED2A8B7947D566B0C2CA";
const FEED_ID = "arroyo";
const STOPS_TTL_MS = 5 * 60_000;
const FEED_TTL_MS = 2_000;
const FANOUT_CONCURRENCY = 8;

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
  tripHeadsign?: string;
  arrivalTime?: string;
  departureTime?: string;
  isEstimated?: boolean;
  isAproximated?: boolean;
  vehicleId?: string | null;
  route?: { routeId?: string };
}

// ---------- protobuf writer ----------
class PbWriter {
  private chunks: number[] = [];
  bytes() { return new Uint8Array(this.chunks); }
  private vi(v: number) {
    let n = v >>> 0;
    while (n > 0x7f) { this.chunks.push((n & 0x7f) | 0x80); n >>>= 7; }
    this.chunks.push(n & 0x7f);
  }
  private vi64(v: number) {
    let lo = v >>> 0, hi = Math.floor(v / 0x100000000) >>> 0;
    while (hi > 0 || lo > 0x7f) {
      this.chunks.push((lo & 0x7f) | 0x80);
      const carry = (hi & 0x7f) << 25;
      lo = ((lo >>> 7) | carry) >>> 0;
      hi >>>= 7;
    }
    this.chunks.push(lo & 0x7f);
  }
  tagVarint(field: number, value: number) {
    this.vi((field << 3) | 0);
    if (value > 0xffffffff) this.vi64(value); else this.vi(value);
  }
  tagString(field: number, value: string) {
    this.vi((field << 3) | 2);
    const b = new TextEncoder().encode(value);
    this.vi(b.length);
    for (const x of b) this.chunks.push(x);
  }
  tagMessage(field: number, sub: Uint8Array) {
    this.vi((field << 3) | 2);
    this.vi(sub.length);
    for (const x of sub) this.chunks.push(x);
  }
}

function parseTs(s?: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return Math.floor(t / 1000);
  const n = Number(s);
  if (!Number.isNaN(n)) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  return null;
}

function encStopTimeEvent(ts: number): Uint8Array {
  const w = new PbWriter();
  w.tagVarint(2, ts); // time (int64)
  return w.bytes();
}

function encStopTimeUpdate(a: Arrival): Uint8Array | null {
  const arrTs = parseTs(a.arrivalTime);
  const depTs = parseTs(a.departureTime);
  if (arrTs === null && depTs === null) return null;
  const w = new PbWriter();
  // NOTE: stop_sequence intentionally omitted — upstream sequence numbers
  // do not match the static GTFS, causing INVALID_STOP_STOP_ID /
  // SOME_STU_NOT_MATCHED. Matching by stop_id is unambiguous here.
  if (arrTs !== null) w.tagMessage(2, encStopTimeEvent(arrTs)); // arrival
  if (depTs !== null) w.tagMessage(3, encStopTimeEvent(depTs)); // departure
  if (a.stopId) w.tagString(4, a.stopId); // stop_id
  // schedule_relationship: SCHEDULED (0)
  w.tagVarint(5, 0);
  return w.bytes();
}

function encTripDescriptor(sample: Arrival): Uint8Array {
  const w = new PbWriter();
  if (sample.tripId) w.tagString(1, sample.tripId); // trip_id
  if (sample.route?.routeId) w.tagString(5, sample.route.routeId); // route_id
  if (sample.directionId !== undefined && sample.directionId !== null) {
    const n = Number(sample.directionId);
    if (!Number.isNaN(n)) w.tagVarint(6, n); // direction_id (uint32)
  }
  return w.bytes();
}

function encVehicleDescriptor(vehicleId: string): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, vehicleId);
  return w.bytes();
}

function encTripUpdate(arrivals: Arrival[], feedTs: number): Uint8Array {
  const sample = arrivals[0];
  const w = new PbWriter();
  w.tagMessage(1, encTripDescriptor(sample)); // trip
  // Order by sequence then arrival time, then drop non-monotonic STUs
  // (avoids STOP_TIME_UPDATE_PREMATURE_ARRIVAL).
  const sorted = [...arrivals].sort((a, b) => {
    const sa = Number(a.stopSequence ?? 0), sb = Number(b.stopSequence ?? 0);
    if (sa !== sb) return sa - sb;
    return (parseTs(a.arrivalTime) ?? 0) - (parseTs(b.arrivalTime) ?? 0);
  });
  const monotonic: Arrival[] = [];
  let lastTs = -Infinity;
  const seenStops = new Set<string>();
  for (const a of sorted) {
    if (a.stopId && seenStops.has(a.stopId)) continue;
    const arr = parseTs(a.arrivalTime);
    const dep = parseTs(a.departureTime);
    const t = arr ?? dep;
    if (t === null) continue;
    if (t < lastTs) continue; // would trigger PREMATURE_ARRIVAL
    lastTs = (dep ?? arr ?? lastTs);
    if (a.stopId) seenStops.add(a.stopId);
    monotonic.push(a);
  }
  for (const a of monotonic) {
    const stu = encStopTimeUpdate(a);
    if (stu) w.tagMessage(2, stu);
  }
  // vehicle (field 3)
  const vid = arrivals.find((a) => a.vehicleId)?.vehicleId;
  if (vid) w.tagMessage(3, encVehicleDescriptor(vid));
  w.tagVarint(4, feedTs); // timestamp
  return w.bytes();
}

function encFeedEntity(id: string, tu: Uint8Array): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, id);
  w.tagMessage(3, tu); // trip_update (field 3)
  return w.bytes();
}

function encFeedHeader(ts: number): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, "2.0");
  w.tagVarint(2, 0); // FULL_DATASET
  w.tagVarint(3, ts);
  return w.bytes();
}

function encFeedMessage(byTrip: Map<string, Arrival[]>, ts: number): Uint8Array {
  const w = new PbWriter();
  w.tagMessage(1, encFeedHeader(ts));
  for (const [tripId, arrivals] of byTrip) {
    w.tagMessage(2, encFeedEntity(tripId, encTripUpdate(arrivals, ts)));
  }
  return w.bytes();
}

// ---------- upstream fetch ----------
const upHeaders = {
  "X-Android-Package": ANDROID_PACKAGE,
  "X-Android-Cert": ANDROID_CERT_SHA1,
  "Accept": "application/json",
};

let stopsCache: { at: number; ids: string[] } | null = null;
async function fetchStopIds(): Promise<string[]> {
  if (stopsCache && Date.now() - stopsCache.at < STOPS_TTL_MS) return stopsCache.ids;
  const u = new URL(`${BASE}/bff/mobile/stop/list`);
  u.searchParams.set("feedId", FEED_ID);
  u.searchParams.set("key", API_KEY);
  const r = await fetch(u, { headers: upHeaders });
  if (!r.ok) throw new Error(`stops ${r.status}`);
  const json = await r.json();
  const ids = (json.stops as Stop[]).map((s) => s.stopId);
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
  return Array.isArray(json) ? json as Arrival[] : [];
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

let feedCache: { at: number; byTrip: Map<string, Arrival[]> } | null = null;
async function buildByTrip(): Promise<Map<string, Arrival[]>> {
  if (feedCache && Date.now() - feedCache.at < FEED_TTL_MS) return feedCache.byTrip;
  const stopIds = await fetchStopIds();
  const all = await pool(stopIds, FANOUT_CONCURRENCY, fetchArrivals);
  const byTrip = new Map<string, Arrival[]>();
  for (const arrivals of all) {
    for (const a of arrivals) {
      if (!a.tripId) continue;
      // Skip purely-approximated predictions (no real-time GPS / no estimate).
      // These hourly placeholders cause TRIP_UPDATE_SUSPICIOUS_DELAY because
      // their times differ from the static schedule by many hours.
      const isRealtime = a.isEstimated === true ||
        (a.vehicleId != null && a.isAproximated !== true);
      if (!isRealtime) continue;
      const list = byTrip.get(a.tripId) ?? [];
      list.push(a);
      byTrip.set(a.tripId, list);
    }
  }
  feedCache = { at: Date.now(), byTrip };
  return byTrip;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    const byTrip = await buildByTrip();
    const feedTs = Math.floor(Date.now() / 1000);

    if (format === "json") {
      const entity = [];
      for (const [tripId, arrivals] of byTrip) {
        const sample = arrivals[0];
        entity.push({
          id: tripId,
          trip_update: {
            trip: {
              trip_id: tripId,
              route_id: sample.route?.routeId,
              direction_id: sample.directionId,
            },
            vehicle: arrivals.find((a) => a.vehicleId)?.vehicleId
              ? { id: arrivals.find((a) => a.vehicleId)!.vehicleId }
              : undefined,
            timestamp: feedTs,
            stop_time_update: [...arrivals]
              .sort((a, b) => Number(a.stopSequence ?? 0) - Number(b.stopSequence ?? 0))
              .map((a) => ({
                stop_id: a.stopId,
                stop_sequence: a.stopSequence,
                arrival: { time: parseTs(a.arrivalTime) },
                departure: a.departureTime ? { time: parseTs(a.departureTime) } : undefined,
              })),
          },
        });
      }
      return new Response(
        JSON.stringify({
          header: { gtfs_realtime_version: "2.0", incrementality: "FULL_DATASET", timestamp: feedTs },
          entity,
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

    const pb = encFeedMessage(byTrip, feedTs);
    return new Response(pb, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-protobuf",
        "Content-Disposition": 'inline; filename="trip-updates.pb"',
        "Cache-Control": "public, max-age=1",
        "X-Trip-Count": String(byTrip.size),
        "X-Feed-Timestamp": String(feedTs),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("trip-updates error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});