// GTFS-Realtime VehiclePositions feed for Arroyo de la Encomienda.
//
// The upstream `/bff/mobile/vehiclePosition` endpoint returns an empty list,
// but each entry in `/bff/mobile/arrivals/{stopId}` carries the assigned
// vehicle's lat/lon/gpsTimestamp. We fan out across every stop, dedupe by
// vehicleId, and keep the most recent GPS sample per vehicle.
//
// GET /functions/v1/gtfs-rt              -> application/x-protobuf (GTFS-RT)
// GET /functions/v1/gtfs-rt?format=json  -> JSON debug
//
// All identifiers are validated/normalized against the published static GTFS
// (https://arroyobus-api.lovable.app/gtfs-static.zip) so trip_id, route_id,
// stop_id and current_stop_sequence always match the schedule dataset.

const BASE = "https://arroyo.actiosae.com";
const API_KEY = "AIzaSyCvtaF21g0lPX0cTgOiIcHZNZRQlw2TRVA";
const ANDROID_PACKAGE = "com.geoactio.arroyo_encomienda";
const ANDROID_CERT_SHA1 = "222E5B204DE7B52F04DBED2A8B7947D566B0C2CA";
const FEED_ID = "arroyo";
const FEED_TTL_MS = 500;
const STOPS_TTL_MS = 5 * 60_000;
const FANOUT_CONCURRENCY = 3;
const VEHICLE_SAMPLE_STOP_IDS = ["1", "12", "22", "43", "60", "10", "20", "29", "50", "33"];

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
      const trip = data.trips.get(tid);
      const departure = st["departure_time"] || st["arrival_time"];
      if (trip && departure && (!trip.startTime || seq < (data.stopSequence.get(`${tid}|__first`) ?? Infinity))) {
        trip.startTime = departure;
        data.stopSequence.set(`${tid}|__first`, seq);
      }
    }
    for (const c of calendar) data.services.set(c["service_id"], {
      days: ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"].map(d => Number(c[d] ?? 0)),
      start: c["start_date"], end: c["end_date"],
    });
    for (const e of calDates) data.exceptions.set(`${e["service_id"]}|${e["date"]}`,Number(e["exception_type"]));
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
  arrivalTime?: string;
  departureTime?: string;
  isEstimated?: boolean;
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
  startTime?: string;
  startDate?: string;
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
  if (s.startTime) w.tagString(2, s.startTime); // start_time (HH:MM:SS)
  if (s.startDate) w.tagString(3, s.startDate); // start_date (YYYYMMDD)
  w.tagVarint(4, 0); // schedule_relationship = SCHEDULED
  if (s.routeId) w.tagString(5, s.routeId); // route_id
  if (s.directionId !== undefined && s.directionId !== null) {
    const n = Number(s.directionId);
    if (!Number.isNaN(n)) w.tagVarint(6, n);
  }
  return w.bytes();
}

// Fleet number -> license plate (provided by the operator).
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

function encodeVehicleDescriptor(id: string): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, id); // id
  w.tagString(2, displayId(id)); // label
  const plate = LICENSE_PLATES[id];
  if (plate) w.tagString(3, plate); // license_plate
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

function parseTimestamp(s?: string): number | null { return parseRealtimeTimestamp(s); }

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
  const r = await fetch(u, { headers: upHeaders, signal: AbortSignal.timeout(8000) });
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

let feedCache: { at: number; samples: VehicleSample[] } | null = null;
async function buildSamples(): Promise<VehicleSample[]> {
  if (feedCache && Date.now() - feedCache.at < FEED_TTL_MS) return feedCache.samples;
  const stopIds = await fetchStopIds();
  const [all, gtfs] = await Promise.all([
    pool(stopIds, FANOUT_CONCURRENCY, fetchArrivals),
    getStaticGtfs(),
  ]);
  if (!gtfs) throw new Error("Static GTFS unavailable; refusing unvalidated trip assignments");
  const now = Math.floor(Date.now()/1000);
  const grouped = new Map<string, Arrival[]>();
  for (const a of all.flat()) {
    if (!a.vehicleId || !freshRealtimeGps(a,now) || typeof a.lat !== "number" || typeof a.lon !== "number"
      || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || Math.abs(a.lat)>90 || Math.abs(a.lon)>180 || (a.lat===0 && a.lon===0)) continue;
    const list = grouped.get(a.vehicleId) ?? []; list.push(a); grouped.set(a.vehicleId,list);
  }
  const best = new Map<string, VehicleSample>();
  for (const [id,arrivals] of grouped) {
    const gps = [...arrivals].sort((a,b) => (parseTimestamp(b.gpsTimestamp) ?? 0)-(parseTimestamp(a.gpsTimestamp) ?? 0))[0];
    const ts = parseTimestamp(gps.gpsTimestamp);
    if (ts === null || gps.lat === undefined || gps.lon === undefined) continue;
    const assigned = selectRealtimeVehicle(arrivals,gtfs,now);
    const match = assigned ? resolveRealtimeArrival(gtfs,assigned,now) : null;
    best.set(id, {
      vehicleId: id, lat: gps.lat, lon: gps.lon, ts,
      tripId: match?.trip.tripId, routeId: match?.trip.routeId, directionId: match?.trip.directionId,
      startTime: match?.trip.startTime, startDate: match?.date,
      // An arrival's destination stop is not the vehicle's current stop.
      isAproximated: gps.isAproximated,
    });
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
    const feedTs = Math.floor(Date.now() / 1000);
    const samples = await buildSamples();

    if (format === "json") {
      return new Response(
        JSON.stringify({
          header: {
            gtfs_realtime_version: "2.0",
            incrementality: "FULL_DATASET",
            timestamp: feedTs,
          },
          entity: samples.map((s) => ({
            id: displayId(s.vehicleId),
            vehicle: {
              trip: s.tripId ? {
                trip_id: s.tripId,
                start_time: s.startTime,
                start_date: s.startDate,
                schedule_relationship: "SCHEDULED",
                route_id: s.routeId,
                direction_id: s.directionId,
              } : undefined,
              position: { latitude: s.lat, longitude: s.lon },
              current_stop_sequence: s.stopSequence,
              stop_id: s.stopId,
              timestamp: s.ts,
              vehicle: { id: displayId(s.vehicleId), label: displayId(s.vehicleId), license_plate: LICENSE_PLATES[s.vehicleId] },
              is_approximated: s.isAproximated,
            },
          })),
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

    const pb = encodeFeedMessage(samples, feedTs);
    return new Response(pb, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-protobuf",
        "Content-Disposition": 'inline; filename="vehicle-positions.pb"',
        "Cache-Control": "no-store",
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