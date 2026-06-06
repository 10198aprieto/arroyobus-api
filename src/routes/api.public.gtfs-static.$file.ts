import { createFileRoute } from "@tanstack/react-router";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  // Simple CSV parser that handles quoted fields
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "")); // remove BOM
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj;
  });
}

export const Route = createFileRoute("/api/public/gtfs-static/$file")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const allowed = [
          "agency",
          "calendar",
          "calendar_dates",
          "feed_info",
          "routes",
          "shapes",
          "stop_times",
          "stops",
          "trips",
        ];
        if (!allowed.includes(params.file)) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const fileUrl = `${url.origin}/gtfs/${params.file}.txt`;
        const r = await fetch(fileUrl);
        if (!r.ok) {
          return new Response(JSON.stringify({ error: "File not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const text = await r.text();
        const json = parseCSV(text);
        return Response.json(json, {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
