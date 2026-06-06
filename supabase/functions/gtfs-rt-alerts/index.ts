// GTFS-Realtime ServiceAlerts feed for Arroyo de la Encomienda.
//
// GET /functions/v1/gtfs-rt-alerts              -> application/x-protobuf
// GET /functions/v1/gtfs-rt-alerts?format=json  -> JSON debug

const BASE = "https://arroyo.actiosae.com";
const API_KEY = "AIzaSyCvtaF21g0lPX0cTgOiIcHZNZRQlw2TRVA";
const ANDROID_PACKAGE = "com.geoactio.arroyo_encomienda";
const ANDROID_CERT_SHA1 = "222E5B204DE7B52F04DBED2A8B7947D566B0C2CA";
const FEED_ID = "arroyo";
const FEED_TTL_MS = 60_000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

interface AlertMessage {
  lang: string;
  title: string;
  body: string;
}

interface Alert {
  alertId: string;
  id?: string;
  feedId?: string;
  category?: number;
  categoryName?: string;
  createdAt?: string;
  createdBy?: string;
  endDate?: string;
  frequency?: number;
  frequencyName?: string;
  routes?: string[] | Array<{ routeId?: string }>;
  name?: string;
  priority?: number;
  startDate?: string;
  stops?: string[] | Array<{ stopId?: string }>;
  url?: string;
  messages?: AlertMessage[];
}

// ---------- tiny protobuf writer ----------
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

function encTranslatedString(text: string, lang?: string): Uint8Array {
  const w = new PbWriter();
  // Translation message inside TranslatedString
  const tw = new PbWriter();
  tw.tagString(1, text); // text
  if (lang) tw.tagString(2, lang); // language
  w.tagMessage(1, tw.bytes()); // translation (repeated field 1)
  return w.bytes();
}

function encActivePeriod(start?: string, end?: string): Uint8Array {
  const w = new PbWriter();
  const s = parseTs(start);
  const e = parseTs(end);
  if (s !== null) w.tagVarint(1, s); // start (uint64)
  if (e !== null) w.tagVarint(2, e); // end (uint64)
  return w.bytes();
}

function encInformedEntity(
  routes?: string[] | Array<{ routeId?: string }>,
  stops?: string[] | Array<{ stopId?: string }>,
): Uint8Array {
  const w = new PbWriter();
  // If routes/stops are simple strings, use them; otherwise extract ids
  if (routes && routes.length > 0) {
    for (const r of routes) {
      const rid = typeof r === "string" ? r : r.routeId;
      if (rid) w.tagString(3, rid); // route_id (field 3)
    }
  }
  if (stops && stops.length > 0) {
    for (const s of stops) {
      const sid = typeof s === "string" ? s : s.stopId;
      if (sid) w.tagString(5, sid); // stop_id (field 5)
    }
  }
  // If neither route nor stop informed, at least mark agency
  if ((!routes || routes.length === 0) && (!stops || stops.length === 0)) {
    w.tagString(1, FEED_ID); // agency_id
  }
  return w.bytes();
}

function encAlert(a: Alert): Uint8Array {
  const w = new PbWriter();

  // active_period (field 1, repeated)
  const ap = encActivePeriod(a.startDate, a.endDate);
  if (ap.length > 0) w.tagMessage(1, ap);

  // informed_entity (field 5, repeated)
  const ie = encInformedEntity(a.routes, a.stops);
  w.tagMessage(5, ie);

  // cause (field 6): default OTHER_CAUSE (1)
  w.tagVarint(6, 1);

  // effect (field 7): default UNKNOWN_EFFECT (7)
  w.tagVarint(7, 7);

  const msg = a.messages?.[0];
  if (msg) {
    if (msg.title) w.tagMessage(10, encTranslatedString(msg.title, msg.lang)); // header_text
    if (msg.body) w.tagMessage(11, encTranslatedString(msg.body, msg.lang)); // description_text
  }
  if (a.url) w.tagMessage(9, encTranslatedString(a.url)); // url

  return w.bytes();
}

function encFeedEntity(id: string, alert: Uint8Array): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, id); // id
  w.tagMessage(5, alert); // alert (field 5)
  return w.bytes();
}

function encFeedHeader(ts: number): Uint8Array {
  const w = new PbWriter();
  w.tagString(1, "2.0"); // gtfs_realtime_version
  w.tagVarint(2, 0); // incrementality = FULL_DATASET
  w.tagVarint(3, ts); // timestamp
  return w.bytes();
}

function encFeedMessage(alerts: Alert[], feedTs: number): Uint8Array {
  const w = new PbWriter();
  w.tagMessage(1, encFeedHeader(feedTs));
  for (const a of alerts) {
    w.tagMessage(2, encFeedEntity(a.alertId ?? a.id ?? "alert", encAlert(a)));
  }
  return w.bytes();
}

// ---------- upstream fetch ----------
const upHeaders = {
  "X-Android-Package": ANDROID_PACKAGE,
  "X-Android-Cert": ANDROID_CERT_SHA1,
  "Accept": "application/json",
};

let alertsCache: { at: number; alerts: Alert[] } | null = null;
async function fetchAlerts(): Promise<Alert[]> {
  if (alertsCache && Date.now() - alertsCache.at < FEED_TTL_MS) return alertsCache.alerts;
  const u = new URL(`${BASE}/bff/mobile/alert/list`);
  u.searchParams.set("feedId", FEED_ID);
  u.searchParams.set("key", API_KEY);
  const r = await fetch(u, { headers: upHeaders });
  if (!r.ok) throw new Error(`alerts ${r.status}`);
  const json = await r.json().catch(() => []);
  const alerts = Array.isArray(json) ? json as Alert[] : [];
  alertsCache = { at: Date.now(), alerts };
  return alerts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format");
    const alerts = await fetchAlerts();
    const feedTs = Math.floor(Date.now() / 1000);

    if (format === "json") {
      const entity = alerts.map((a) => {
        const msg = a.messages?.[0];
        return {
          id: a.alertId ?? a.id,
          alert: {
            active_period: [{ start: parseTs(a.startDate), end: parseTs(a.endDate) }],
            informed_entity: [
              {
                agency_id: (!a.routes?.length && !a.stops?.length) ? FEED_ID : undefined,
                route_id: (a.routes?.length ? (typeof a.routes[0] === "string" ? a.routes[0] : (a.routes[0] as { routeId?: string }).routeId) : undefined),
                stop_id: (a.stops?.length ? (typeof a.stops[0] === "string" ? a.stops[0] : (a.stops[0] as { stopId?: string }).stopId) : undefined),
              },
            ],
            cause: "OTHER_CAUSE",
            effect: "UNKNOWN_EFFECT",
            url: a.url ? { translation: [{ text: a.url }] } : undefined,
            header_text: msg?.title ? { translation: [{ text: msg.title, language: msg.lang }] } : undefined,
            description_text: msg?.body ? { translation: [{ text: msg.body, language: msg.lang }] } : undefined,
          },
        };
      });
      return new Response(
        JSON.stringify({
          header: { gtfs_realtime_version: "2.0", incrementality: "FULL_DATASET", timestamp: feedTs },
          entity,
        }, null, 2),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=60",
          },
        },
      );
    }

    const pb = encFeedMessage(alerts, feedTs);
    return new Response(pb, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/x-protobuf",
        "Content-Disposition": 'inline; filename="service-alerts.pb"',
        "Cache-Control": "public, max-age=60",
        "X-Alert-Count": String(alerts.length),
        "X-Feed-Timestamp": String(feedTs),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("gtfs-rt-alerts error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
