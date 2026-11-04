import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const FALLBACK_BASE_URL = "https://arroyobus-api.lovable.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

function baseUrlFromRequest(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return FALLBACK_BASE_URL;
  const proto = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = baseUrlFromRequest(request);
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/routes", changefreq: "weekly", priority: "0.8" },
          { path: "/stops", changefreq: "weekly", priority: "0.8" },
          { path: "/vehicles", changefreq: "hourly", priority: "0.7" },
          { path: "/riobus", changefreq: "weekly", priority: "0.7" },
          { path: "/alerts", changefreq: "hourly", priority: "0.7" },
          { path: "/tad", changefreq: "monthly", priority: "0.5" },
          { path: "/suggestion", changefreq: "monthly", priority: "0.5" },
          { path: "/gtfs-rt", changefreq: "daily", priority: "0.9" },
          { path: "/actiosae", changefreq: "daily", priority: "0.8" },
          { path: "/explorer", changefreq: "weekly", priority: "0.6" },
          { path: "/status", changefreq: "hourly", priority: "0.5" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${baseUrl}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
