// GTFS-Realtime VehiclePositions feed for Arroyo de la Encomienda
// Proxies https://arroyo.actiosae.com/bff/mobile/vehiclePosition and re-encodes
// the response as a GTFS-Realtime FeedMessage (protobuf).
//
// GET /functions/v1/gtfs-rt              -> application/x-protobuf (GTFS-RT)
// GET /functions/v1/gtfs-rt?format=json  -> JSON (debug / raw upstream)

const UPSTREAM = "https://arroyo.actiosae.com/bff/mobile/vehiclePosition";
const API_KEY = "AIzaSyCvtaF21g0lPX0cTgOiIcHZNZRQlw2TRVA";
const ANDROID_PACKAGE = "com.geoactio.arroyo_encomienda";
const ANDROID_CERT_SHA1 = "222E5B204DE7B52F04DBED2A8B7947D566B0C2CA";
const FEED_ID = "arroyo";
const CACHE_TTL_MS = 5_000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface GpsPosition {
  timestamp?: string;
  latitude: number;
  longitude: number;
  orientation?: number;
  speed?: number;
  directionId?: string;
  routeId?: string;
  vehicleId?: string;
  vehicleName?: string;
}

interface UpstreamResponse {
  gpsPositions?: GpsPosition[];
  message?: string;
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

function encodePosition(p: GpsPosition): Uint8Array {
  const w = new PbWriter();
  w.tagFloat(1, p.latitude); // latitude
  w.tagFloat(2, p.longitude); // longitude
  if (typeof p.orientation === "number") w.tagFloat(3, p.orientation); // bearing
  if (typeof p.speed === "number") w.tagFloat(5, p.speed / 3.6); // m/s
  return w.bytes();
}

function encodeTripDescriptor(p: GpsPosition): Uint8Array | null {
  if (!p.routeId && !p.directionId) return null;
  const w = new PbWriter();
  if (p.routeId) w.tagString(5, p.routeId); // route_id
  if (p.directionId !== undefined && p.directionId !== null) {
    const n = Number(p.directionId);
    if (!Number.isNaN(n)) w.tagVarint(6, n); // direction_id (uint32)
  }
  return w.bytes();
}

function encodeVehicleDescriptor(p: GpsPosition): Uint8Array | null {
  if (!p.vehicleId && !p.vehicleName) return null;
  const w = new PbWriter();
  if (p.vehicleId) w.tagString(1, p.vehicleId); // id
  if (p.vehicleName) w.tagString(2, p.vehicleName); // label
  return w.bytes();
}

function encodeVehiclePosition(p: GpsPosition, ts: number): Uint8Array {
  const w = new PbWriter();
  const trip = encodeTripDescriptor(p);
  if (trip) w.tagMessage(1, trip);
  w.tagMessage(2, encodePosition(p)); // position
  const veh = encodeVehicleDescriptor(p);
  if (veh) w.tagMessage(8, veh);
  w.tagVarint(5, ts); // timestamp (uint64)
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

function encodeFeedMessage(positions: GpsPosition[], feedTs: number): Uint8Array {
  const w = new PbWriter();
  w.tagMessage(1, encodeFeedHeader(feedTs)); // header
  positions.forEach((p, i) => {
    const ts = parseTimestamp(p.timestamp) ?? feedTs;
    const id = p.vehicleId || `veh_${i}`;
    w.tagMessage(2, encodeFeedEntity(id, encodeVehiclePosition(p, ts))); // entity
  });
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

// ---------- upstream fetch with short in-memory cache ----------
let cache: { at: number; data: UpstreamResponse } | null = null;

async function fetchPositions(): Promise<UpstreamResponse> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const url = new URL(UPSTREAM);
  url.searchParams.set("feedId", FEED_ID);
  url.searchParams.set("key", API_KEY);
  const res = await fetch(url.toString(), {
    headers: {
      "X-Android-Package": ANDROID_PACKAGE,
      "X-Android-Cert": ANDROID_CERT_SHA1,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream ${res.status}: ${text.slice(0, 200)}`);
  }
  const data: UpstreamResponse = await res.json();
  cache = { at: Date.now(), data };
  return data;
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
    const data = await fetchPositions();
    const positions = data.gpsPositions ?? [];
    const feedTs = Math.floor(Date.now() / 1000);

    if (format === "json") {
      return new Response(
        JSON.stringify({
          header: {
            gtfs_realtime_version: "2.0",
            incrementality: "FULL_DATASET",
            timestamp: feedTs,
          },
          entity: positions.map((p, i) => ({
            id: p.vehicleId || `veh_${i}`,
            vehicle: {
              trip: { route_id: p.routeId, direction_id: p.directionId },
              position: {
                latitude: p.latitude,
                longitude: p.longitude,
                bearing: p.orientation,
                speed: typeof p.speed === "number" ? p.speed / 3.6 : undefined,
              },
              vehicle: { id: p.vehicleId, label: p.vehicleName },
              timestamp: parseTimestamp(p.timestamp) ?? feedTs,
            },
          })),
          upstream_message: data.message,
        }, null, 2),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=5",
          },
        },
      );
    }

    const pb = encodeFeedMessage(positions, feedTs);
    return new Response(pb, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-protobuf",
        "Content-Disposition": 'inline; filename="vehicle-positions.pb"',
        "Cache-Control": "public, max-age=5",
        "X-Vehicle-Count": String(positions.length),
        "X-Feed-Timestamp": String(feedTs),
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