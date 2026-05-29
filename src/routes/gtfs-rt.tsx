import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/gtfs-rt")({ component: GtfsRtPage });

function GtfsRtPage() {
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const feeds = [
    {
      title: "VehiclePositions",
      desc: "Posiciones GPS de los autobuses, reconstruidas desde las llegadas.",
      pb: `${base}/gtfs-rt`,
      json: `${base}/gtfs-rt?format=json`,
    },
    {
      title: "TripUpdates",
      desc: "Tiempos de llegada/salida estimados por viaje.",
      pb: `${base}/gtfs-rt-trip-updates`,
      json: `${base}/gtfs-rt-trip-updates?format=json`,
    },
  ];

  const staticBase = typeof window !== "undefined" ? window.location.origin : "";
  const staticFeeds = [
    { label: "GTFS estático (zip)", url: `${staticBase}/gtfs-static.zip` },
    { label: "routes.txt", url: `${staticBase}/gtfs/routes.txt` },
    { label: "stops.txt", url: `${staticBase}/gtfs/stops.txt` },
    { label: "trips.txt", url: `${staticBase}/gtfs/trips.txt` },
    { label: "stop_times.txt", url: `${staticBase}/gtfs/stop_times.txt` },
    { label: "shapes.txt", url: `${staticBase}/gtfs/shapes.txt` },
    { label: "calendar.txt", url: `${staticBase}/gtfs/calendar.txt` },
    { label: "calendar_dates.txt", url: `${staticBase}/gtfs/calendar_dates.txt` },
    { label: "agency.txt", url: `${staticBase}/gtfs/agency.txt` },
    { label: "feed_info.txt", url: `${staticBase}/gtfs/feed_info.txt` },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Feeds GTFS-Realtime</h1>
      <p className="mt-2 text-muted-foreground">
        Endpoints públicos en formato GTFS-RT (protobuf) compatibles con cualquier
        consumidor estándar (OBA, OpenTripPlanner, etc.).
      </p>
      <div className="mt-6 grid gap-4">
        {feeds.map((f) => (
          <div key={f.title} className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            <div className="mt-3 space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Protobuf: </span>
                <a className="font-mono text-primary hover:underline" href={f.pb}>{f.pb}</a>
              </div>
              <div>
                <span className="text-muted-foreground">JSON debug: </span>
                <a className="font-mono text-primary hover:underline" href={f.json}>{f.json}</a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-xl font-bold">GTFS estático</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Horarios, paradas, rutas y formas (laregional-valladolid-es). Empareja
        los <code>trip_id</code> / <code>route_id</code> / <code>stop_id</code> del feed realtime.
      </p>
      <div className="mt-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ul className="space-y-1">
          {staticFeeds.map((f) => (
            <li key={f.url}>
              <span className="text-muted-foreground">{f.label}: </span>
              <a className="font-mono text-primary hover:underline" href={f.url}>{f.url}</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}