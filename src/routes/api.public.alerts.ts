import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { encodeAlertsFeed, type AlertRow } from "@/lib/gtfs-pb";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const Route = createFileRoute("/api/public/alerts")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const format = new URL(request.url).searchParams.get("format");
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY!;
        const sb = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const nowIso = new Date().toISOString();
        const { data, error } = await sb
          .from("alerts")
          .select("id, header, description, cause, effect, route_ids, stop_ids, url, start_at, end_at")
          .eq("activo", true)
          .order("start_at", { ascending: false });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        const alerts = ((data ?? []) as AlertRow[]).filter(
          (a) => !a.end_at || a.end_at > nowIso,
        );
        const feedTs = Math.floor(Date.now() / 1000);

        if (format === "json") {
          return new Response(
            JSON.stringify(
              {
                header: { gtfs_realtime_version: "2.0", incrementality: "FULL_DATASET", timestamp: feedTs },
                entity: alerts.map((a) => ({
                  id: a.id,
                  alert: {
                    active_period: [
                      {
                        start: Math.floor(Date.parse(a.start_at) / 1000),
                        ...(a.end_at ? { end: Math.floor(Date.parse(a.end_at) / 1000) } : {}),
                      },
                    ],
                    informed_entity:
                      (a.route_ids?.length ?? 0) + (a.stop_ids?.length ?? 0) > 0
                        ? [
                            ...(a.route_ids ?? []).map((route_id) => ({ route_id })),
                            ...(a.stop_ids ?? []).map((stop_id) => ({ stop_id })),
                          ]
                        : [{ agency_id: "laregional" }],
                    cause: a.cause,
                    effect: a.effect,
                    ...(a.url ? { url: { translation: [{ text: a.url, language: "es" }] } } : {}),
                    header_text: { translation: [{ text: a.header, language: "es" }] },
                    ...(a.description
                      ? { description_text: { translation: [{ text: a.description, language: "es" }] } }
                      : {}),
                  },
                })),
              },
              null,
              2,
            ),
            { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=2", ...CORS } },
          );
        }

        const buf = encodeAlertsFeed(alerts, feedTs);
        return new Response(buf as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/x-protobuf",
            "Cache-Control": "public, max-age=2",
            ...CORS,
          },
        });
      },
    },
  },
});
