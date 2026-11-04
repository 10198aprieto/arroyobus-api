import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const FALLBACK_BASE_URL = "https://arroyobus-api.lovable.app";

function baseUrlFromRequest(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return FALLBACK_BASE_URL;
  const proto = host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

// Dynamic robots.txt so each public domain (arroyobus-api.lovable.app,
// api.arroyobus.net, …) gets a Sitemap line pointing at its own host.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = baseUrlFromRequest(request);
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /admin",
          "",
          `Sitemap: ${baseUrl}/sitemap.xml`,
          "",
        ].join("\n");

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
