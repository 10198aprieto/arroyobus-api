// GTFS-Realtime TripUpdates feed for Arroyo de la Encomienda.
//
// Builds a FeedMessage with one TripUpdate per active trip by:
//   1. Listing stops once (cached 5 min).
//   2. Fan-out `bff/mobile/arrivals/{stopId}` for every stop (parallel).
//   3. Aggregating arrivals by tripId, ordering by stopSequence.
//
// GET  /functions/v1/gtfs-rt-trip-updates              -> application/x-protobuf
// GET  /functions/v1/gtfs-rt-trip-updates?format=json  -> JSON debug
//
// Trips, routes, stops and stop_sequence are validated against the published
// static GTFS (https://arroyobus-api.lovable.app/gtfs-static.zip).

const BASE = "https://arroyo.actiosae.com";
const API_KEY = "AIzaSyCvtaF21g0lPX0cTgOiIcHZNZRQlw2TRVA";
const ANDROID_PACKAGE = "com.geoactio.arroyo_encomienda";
const ANDROID_CERT_SHA1 = "222E5B204DE7B52F04DBED2A8B7947D566B0C2CA";
const FEED_ID = "arroyo";
const STOPS_TTL_MS = 5 * 60_000;
const FEED_TTL_MS = 500;
const FANOUT_CONCURRENCY = 8;

// ---------- static GTFS reference ----------
const STATIC_BASE = "https://arroyobus-api.lovable.app/gtfs";
const STATIC_TTL_MS = 5 * 60_000;

interface StaticStopTime { stopId: string; sequence: number; arrival: number; departure: number; }
interface StaticTrip {
  tripId: string;
  routeId: string;
  serviceId: string;
  startTime?: string;
  directionId?: number;
  headsign?: string;
}
interface StaticGtfs {
  routeIds: Set<string>;
  stopIds: Set<string>;
  trips: Map<string, StaticTrip>;
  stopSequence: Map<string, number>;
  stopTimes: Map<string, StaticStopTime[]>;
  services: Map<string, { days: number[]; start: string; end: string }>;
  exceptions: Map<string, number>;
}

let staticCache: { at: number; data: StaticGtfs } | null = null;
async function fetchStaticJson(file: string): Promise<Record<string, string>[]> {
  const r = await fetch(`${STATIC_BASE}/${file}.json`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`static ${file} ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j as Record<string, string>[] : [];
}
async function getStaticGtfs(): Promise<StaticGtfs | null> {
  if (staticCache && Date.now() - staticCache.at < STATIC_TTL_MS) return staticCache.data;
  try {
    const [routes, stops, trips, stopTimes, calendar, calDates] = await Promise.all([
      fetchStaticJson("routes"),
      fetchStaticJson("stops"),
      fetchStaticJson("trips"),
      fetchStaticJson("stop_times"),
      fetchStaticJson("calendar"),
      fetchStaticJson("calendar_dates"),
    ]);
    const data: StaticGtfs = {
      routeIds: new Set(routes.map((r) => r["route_id"]).filter(Boolean)),
      stopIds: new Set(stops.map((s) => s["stop_id"]).filter(Boolean)),
      trips: new Map(),
      stopSequence: new Map(),
      stopTimes: new Map(),
      services: new Map(),
      exceptions: new Map(),
    };
    for (const t of trips) {
      const id = t["trip_id"];
      if (!id) continue;
      const d = t["direction_id"];
      const dn = d ? Number(d) : NaN;
      data.trips.set(id, {
        tripId: id,
        routeId: t["route_id"] ?? "",
        serviceId: t["service_id"] ?? "",
        directionId: Number.isNaN(dn) ? undefined : dn,
        headsign: t["trip_headsign"] || undefined,
      });
    }
    for (const st of stopTimes) {
      const tid = st["trip_id"], sid = st["stop_id"];
      if (!tid || !sid) continue;
      const seq = Number(st["stop_sequence"]);
      if (Number.isNaN(seq)) continue;
      const occurrence = { stopId: sid, sequence: seq, arrival: scheduleSeconds(st["arrival_time"] || st["departure_time"]), departure: scheduleSeconds(st["departure_time"] || st["arrival_time"]) };
      if (Number.isFinite(occurrence.arrival) && Number.isFinite(occurrence.departure)) {
        const list = data.stopTimes.get(tid) ?? []; list.push(occurrence); data.stopTimes.set(tid,list);
      }
      const key = `${tid}|${sid}`;
      if (!data.stopSequence.has(key)) data.stopSequence.set(key, seq);
    }
    for (const c of calendar) {
      const id = c["service_id"];
      if (!id) continue;
      data.services.set(id, {
        days: [
          Number(c["sunday"] ?? 0), Number(c["monday"] ?? 0), Number(c["tuesday"] ?? 0),
          Number(c["wednesday"] ?? 0), Number(c["thursday"] ?? 0), Number(c["friday"] ?? 0),
          Number(c["saturday"] ?? 0),
        ],
        start: c["start_date"] ?? "",
        end: c["end_date"] ?? "",
      });
    }
    for (const e of calDates) {
      if (!e["service_id"] || !e["date"]) continue;
      data.exceptions.set(`${e["service_id"]}|${e["date"]}`, Number(e["exception_type"] ?? 0));
    }
    for (const [id,times] of data.stopTimes) {
      times.sort((a,b) => a.sequence-b.sequence);
      const trip = data.trips.get(id);
      if (trip && times.length) {
        const seconds = times[0].departure;
        trip.startTime = `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      }
    }
    staticCache = { at: Date.now(), data };
    return data;
  } catch (err) {
    console.error("static gtfs load failed:", err instanceof Error ? err.message : err);
    return staticCache?.data ?? null;
  }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface Stop { stopId: string; }
interface Arrival {
  hasAssignment?: boolean;
  receivedAt?: string;
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
  gpsTimestamp?: string;
  route?: { routeId?: string };
}

/** Values resolved from the static GTFS, attached to each arrival. */
interface Normalized extends Arrival {
  staticRouteId?: string;
  staticDirectionId?: number;
  staticStopSequence?: number;
  startDate?: string;
  startTime?: string;
}


// Shared algorithm kept inline so these existing functions deploy independently.
export function parseRealtimeTimestamp(value?: string): number | null {
  if (!value?.trim()) return null;
  let seconds: number;
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value); seconds = n > 1e12 ? n / 1000 : n;
  } else {
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
    seconds = Date.parse(value) / 1000;
  }
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : null;
}
export function realtimeServiceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value ?? '').join('');
}
function scheduleSeconds(value: string): number {
  const p = value.split(':').map(Number);
  return p.length === 3 && p.every(Number.isFinite) ? p[0]*3600+p[1]*60+p[2] : NaN;
}
function scheduleEpoch(date: string): number {
  const noon = Date.UTC(Number(date.slice(0,4)), Number(date.slice(4,6))-1, Number(date.slice(6,8)),12);
  const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(noon)));
  return noon/1000 - (localHour-12)*3600 - 43200;
}
export function realtimeServiceActive(g: StaticGtfs, id: string, date: string): boolean {
  const ex = g.exceptions.get(`${id}|${date}`);
  if (ex === 1) return true;
  if (ex === 2) return false;
  const s = g.services.get(id);
  const day = new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(4,6))-1,Number(date.slice(6,8)))).getUTCDay();
  return !!s && date >= s.start && date <= s.end && s.days[day] === 1;
}
export function freshRealtimeGps(a: Arrival, now: number): boolean {
  const ts = parseRealtimeTimestamp(a.gpsTimestamp);
  return ts !== null && now-ts <= 300 && ts <= now+30 && a.hasAssignment !== false;
}
export function resolveRealtimeArrival(g: StaticGtfs, a: Arrival, now: number) {
  if (!a.tripId || !a.stopId) return null;
  const trip = g.trips.get(a.tripId);
  if (!trip || (a.route?.routeId && a.route.routeId !== trip.routeId)) return null;
  const event = parseRealtimeTimestamp(a.arrivalTime) ?? parseRealtimeTimestamp(a.departureTime);
  if (event === null) return null;
  const today = realtimeServiceDate(new Date(now*1000));
  const dates = [-1,0,1].map(offset => {
    const d = new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(4,6))-1,Number(today.slice(6,8))+offset,12));
    return d.toISOString().slice(0,10).replaceAll('-','');
  });
  let best: { trip: StaticTrip; stop: StaticStopTime; date: string; error: number; start: number; end: number } | null = null;
  for (const date of dates) {
    if (!realtimeServiceActive(g,trip.serviceId,date)) continue;
    const times = g.stopTimes.get(trip.tripId) ?? [];
    if (!times.length) continue;
    const epoch = scheduleEpoch(date);
    for (const stop of times.filter(s => s.stopId === a.stopId)) {
      const error = Math.abs(event-(epoch+stop.arrival));
      if (error > 1800 || (best && error >= best.error)) continue;
      best = { trip,stop,date,error,start: epoch+times[0].departure,end: epoch+times[times.length-1].arrival };
    }
  }
  return best;
}
export function selectRealtimeVehicle(arrivals: Arrival[], g: StaticGtfs, now: number): Arrival | undefined {
  return arrivals.filter(a => freshRealtimeGps(a,now) && a.isAproximated !== true)
    .map(a => ({ a, match: resolveRealtimeArrival(g,a,now) }))
    .filter(({match}) => match && now >= match.start-120 && now <= match.end+1800)
    .sort((x,y) => Number(y.a.isEstimated === true)-Number(x.a.isEstimated === true)
      || Math.abs((parseRealtimeTimestamp(x.a.arrivalTime) ?? Infinity)-now)-Math.abs((parseRealtimeTimestamp(y.a.arrivalTime) ?? Infinity)-now)
      || (parseRealtimeTimestamp(y.a.gpsTimestamp) ?? 0)-(parseRealtimeTimestamp(x.a.gpsTimestamp) ?? 0)
      || (x.a.tripId ?? '').localeCompare(y.a.tripId ?? ''))[0]?.a;
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

function parseTs(s?: string): number | null { return parseRealtimeTimestamp(s); }

function encStopTimeEvent(ts: number): Uint8Array {
  const w = new PbWriter();
  w.tagVarint(2, ts); // time (int64)
  return w.bytes();
}

function encStopTimeUpdate(a: Normalized): Uint8Array | null {
  const arrTs = parseTs(a.arrivalTime);
  const depTs = parseTs(a.departureTime);
  if (arrTs === null && depTs === null) return null;
  const w = new PbWriter();
  // stop_sequence comes from the static GTFS stop_times.txt (upstream
  // sequence numbers do not match); omitted when the pair is unknown.
  if (a.staticStopSequence !== undefined) w.tagVarint(1, a.staticStopSequence);
  if (arrTs !== null) w.tagMessage(2, encStopTimeEvent(arrTs)); // arrival
  if (depTs !== null) w.tagMessage(3, encStopTimeEvent(depTs)); // departure
  if (a.stopId) w.tagString(4, a.stopId); // stop_id
  // schedule_relationship: SCHEDULED (0)
  w.tagVarint(5, 0);
  return w.bytes();
}

function encTripDescriptor(sample: Normalized): Uint8Array {
  const w = new PbWriter();
  if (sample.tripId) w.tagString(1, sample.tripId); // trip_id
  if (sample.startTime) w.tagString(2, sample.startTime);
  if (sample.startDate) w.tagString(3, sample.startDate); // start_date (YYYYMMDD)
  w.tagVarint(4, 0); // schedule_relationship: SCHEDULED
  const routeId = sample.staticRouteId ?? sample.route?.routeId;
  if (routeId) w.tagString(5, routeId); // route_id (static)
  if (sample.staticDirectionId !== undefined) w.tagVarint(6, sample.staticDirectionId);
  return w.bytes();
}

const LICENSE_PLATES: Record<string, string> = {
  "6346": "4772LKL",
  "6372": "1543MPD",
  "6386": "0475NPG",
  "6355": "2575MHS",
  "6352": "2304MHS",
  "6318": "8612JZX",
  "6341": "2384LFB",
};

// "6386 · 0475NPG" — used wherever the JSON feed shows a vehicle id.
function displayId(id: string): string {
  const plate = LICENSE_PLATES[id];
  return plate ? `${id} · ${plate}` : id;
}

function encVehicleDescriptor(vehicleId: string): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, vehicleId);
  return w.bytes();
}

export function cleanRealtimeUpdates(arrivals: Normalized[]): Normalized[] {
  const sorted = [...arrivals].sort((a,b) => (a.staticStopSequence ?? Infinity)-(b.staticStopSequence ?? Infinity)
    || (parseTs(b.receivedAt) ?? 0)-(parseTs(a.receivedAt) ?? 0));
  const out: Normalized[] = []; const seen = new Set<number>(); let last = -Infinity;
  for (const a of sorted) {
    const seq = a.staticStopSequence, arr = parseTs(a.arrivalTime), dep = parseTs(a.departureTime), first = arr ?? dep;
    if (seq === undefined || seen.has(seq) || first === null || first < last || (arr !== null && dep !== null && dep < arr)) continue;
    seen.add(seq); last = dep ?? arr ?? last; out.push(a);
  }
  return out;
}

function encTripUpdate(arrivals: Normalized[], feedTs: number): Uint8Array {
  const sample = arrivals[0];
  const w = new PbWriter();
  w.tagMessage(1, encTripDescriptor(sample)); // trip
  for (const a of arrivals) {
    const stu = encStopTimeUpdate(a);
    if (stu) w.tagMessage(2, stu);
  }
  // vehicle (field 3)
  const vid = arrivals.find((a) => a.vehicleId)?.vehicleId;
  if (vid) w.tagMessage(3, encVehicleDescriptor(vid));
  w.tagVarint(4, predictionTimestamp(arrivals, feedTs)); // source update timestamp
  return w.bytes();
}

export function predictionTimestamp(arrivals: Arrival[], fallback: number): number {
  const times = arrivals.map(a => parseTs(a.receivedAt) ?? parseTs(a.gpsTimestamp)).filter((t): t is number => t !== null && t <= fallback + 30);
  return times.length ? Math.max(...times) : fallback;
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

function encFeedMessage(byTrip: Map<string, Normalized[]>, ts: number): Uint8Array {
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
  const r = await fetch(u, { headers: upHeaders, signal: AbortSignal.timeout(8000) });
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
  const r = await fetch(u, { headers: upHeaders, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const json = await r.json().catch(() => []);
  return Array.isArray(json) ? (json as Arrival[]).map(a => ({ ...a, stopId: a.stopId ?? stopId })) : [];
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

let feedCache: { at: number; byTrip: Map<string, Normalized[]> } | null = null;
async function buildByTrip(): Promise<Map<string, Normalized[]>> {
  if (feedCache && Date.now() - feedCache.at < FEED_TTL_MS) return feedCache.byTrip;
  const stopIds = await fetchStopIds();
  const [all, gtfs] = await Promise.all([
    pool(stopIds, FANOUT_CONCURRENCY, fetchArrivals),
    getStaticGtfs(),
  ]);
  if (!gtfs) throw new Error("Static GTFS unavailable; refusing unvalidated trip assignments");
  const now = Math.floor(Date.now()/1000);
  const byTrip = new Map<string, Normalized[]>();
  const candidates = new Map<string, Arrival[]>();
  for (const a of all.flat()) {
    if (!a.vehicleId) continue;
    const list = candidates.get(a.vehicleId) ?? []; list.push(a); candidates.set(a.vehicleId,list);
  }
  const activeTrip = new Map<string, string>();
  for (const [vehicleId, arrivals] of candidates) {
    const chosen = selectRealtimeVehicle(arrivals, gtfs, now);
    if (chosen?.tripId) activeTrip.set(vehicleId, chosen.tripId);
  }
  for (const a of all.flat()) {
    // Vehicle assignment alone is not a live prediction: it also labels future trips.
    if (a.isEstimated !== true || a.isAproximated === true || (a.vehicleId && !freshRealtimeGps(a,now))) continue;
    if (a.vehicleId && activeTrip.get(a.vehicleId) !== a.tripId) continue;
    const match = resolveRealtimeArrival(gtfs,a,now);
    if (!match) continue;
    const key = `${match.trip.tripId}:${match.date}`;
    const list = byTrip.get(key) ?? [];
    list.push({ ...a, staticRouteId: match.trip.routeId, staticDirectionId: match.trip.directionId,
      staticStopSequence: match.stop.sequence, startDate: match.date, startTime: match.trip.startTime });
    byTrip.set(key,list);
  }
  for (const [key,arrivals] of byTrip) {
    const cleaned = cleanRealtimeUpdates(arrivals);
    if (cleaned.length) byTrip.set(key,cleaned); else byTrip.delete(key);
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
        const vehicleId = arrivals.find(a => a.vehicleId)?.vehicleId;
        entity.push({
          id: tripId,
          trip_update: {
            trip: {
              trip_id: sample.tripId,
              start_time: sample.startTime,
              route_id: sample.staticRouteId ?? sample.route?.routeId,
              direction_id: sample.staticDirectionId,
              start_date: sample.startDate,
              schedule_relationship: "SCHEDULED",
            },
            vehicle: vehicleId ? { id: displayId(vehicleId), label: displayId(vehicleId), license_plate: LICENSE_PLATES[vehicleId] } : undefined,
            timestamp: predictionTimestamp(arrivals, feedTs),
            stop_time_update: [...arrivals]
              .sort((a, b) =>
                (a.staticStopSequence ?? Number(a.stopSequence ?? 0)) -
                (b.staticStopSequence ?? Number(b.stopSequence ?? 0)))
              .map((a) => ({
                stop_id: a.stopId,
                stop_sequence: a.staticStopSequence,
                arrival: parseTs(a.arrivalTime) !== null ? { time: parseTs(a.arrivalTime) } : undefined,
                departure: parseTs(a.departureTime) !== null ? { time: parseTs(a.departureTime) } : undefined,
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
            "Cache-Control": "no-store",
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
        "Cache-Control": "no-store",
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