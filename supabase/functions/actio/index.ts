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
    return new Response(body, {
      status: r.status,
      headers: {
        ...cors,
        "Content-Type": r.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": req.method === "GET" ? "public, max-age=10" : "no-store",
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