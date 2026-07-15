import { createFileRoute } from "@tanstack/react-router";
import { zipSync, strToU8 } from "fflate";

const ACTIO_BASE =
  process.env.ACTIOSAE_PROXY_URL ??
  `${process.env.SUPABASE_URL ?? "https://enzeyiwpoomhlxmcjivn.supabase.co"}/functions/v1/actio`;
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

interface ActioRoute {
  routeId: string;
  routeShortName?: string;
  routeLongName?: string;
  routeColor?: string;
  routeTextColor?: string;
  routeSortOrder?: number;
}
interface ActioStop {
  stopId: string;
  stopName: string;
  stopLat: string | number;
  stopLon: string | number;
}

async function actio<T>(path: string): Promise<T> {
  const url = new URL(ACTIO_BASE);
  url.searchParams.set("path", path);
  const r = await fetch(url.toString(), {
    headers: SUPABASE_KEY
      ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      : {},
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return (await r.json()) as T;
}

const csvEscape = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number | null | undefined)[][]): string =>
  rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";

function agencyTxt(): string {
  return csv([
    ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
    ["actio_arroyo", "Arroyobus", "https://arroyo.actiosae.com/", "Europe/Madrid", "es"],
  ]);
}

function feedInfoTxt(): string {
  const today = new Date();
  const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  return csv([
    ["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version"],
    ["Arroyobus Open Data (reconstruido de Actio SAE)", "https://arroyobus-api.lovable.app/", "es", yyyymmdd],
  ]);
}

function routesTxt(routes: ActioRoute[]): string {
  const rows: (string | number | null | undefined)[][] = [
    ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type", "route_color", "route_text_color", "route_sort_order"],
  ];
  for (const r of routes) {
    rows.push([
      r.routeId,
      "actio_arroyo",
      r.routeShortName ?? r.routeId,
      r.routeLongName ?? "",
      3,
      (r.routeColor ?? "").replace(/^#/, ""),
      (r.routeTextColor ?? "").replace(/^#/, ""),
      r.routeSortOrder ?? 0,
    ]);
  }
  return csv(rows);
}

function stopsTxt(stops: ActioStop[]): string {
  const rows: (string | number | null | undefined)[][] = [
    ["stop_id", "stop_name", "stop_lat", "stop_lon"],
  ];
  for (const s of stops) {
    rows.push([s.stopId, s.stopName, Number(s.stopLat), Number(s.stopLon)]);
  }
  return csv(rows);
}

function calendarTxt(): string {
  const start = new Date();
  const end = new Date(start.getTime() + 365 * 24 * 3600 * 1000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return csv([
    ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
    ["daily", 1, 1, 1, 1, 1, 1, 1, fmt(start), fmt(end)],
  ]);
}

async function buildAll(): Promise<Record<string, string>> {
  const [routesRes, stopsRes] = await Promise.all([
    actio<{ routes: ActioRoute[] }>("route/list"),
    actio<{ stops: ActioStop[] }>("stop/list"),
  ]);
  return {
    "agency.txt": agencyTxt(),
    "feed_info.txt": feedInfoTxt(),
    "calendar.txt": calendarTxt(),
    "routes.txt": routesTxt(routesRes.routes ?? []),
    "stops.txt": stopsTxt(stopsRes.stops ?? []),
  };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const Route = createFileRoute("/api/public/actiosae/gtfs/$file")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
        try {
          const files = await buildAll();
          const name = params.file;

          if (name === "gtfs.zip") {
            const zipInput: Record<string, Uint8Array> = {};
            for (const [k, v] of Object.entries(files)) zipInput[k] = strToU8(v);
            const zipped = zipSync(zipInput, { level: 6 });
            const body = new Uint8Array(zipped);
            return new Response(body, {
              headers: {
                ...CORS,
                "Content-Type": "application/zip",
                "Content-Disposition": 'attachment; filename="gtfs-actiosae.zip"',
                "Cache-Control": "public, max-age=300",
              },
            });
          }

          if (name in files) {
            return new Response(files[name], {
              headers: {
                ...CORS,
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=300",
              },
            });
          }

          return new Response(JSON.stringify({ error: "not found", available: Object.keys(files).concat("gtfs.zip") }), {
            status: 404,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "error";
          return new Response(JSON.stringify({ error: msg }), {
            status: 502,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});