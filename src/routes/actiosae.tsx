import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/actiosae")({ component: ActioSaePage });

function ActioSaePage() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rtBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

  const staticFiles = [
    { label: "gtfs.zip (bundle completo)", file: "gtfs.zip" },
    { label: "agency.txt", file: "agency.txt" },
    { label: "feed_info.txt", file: "feed_info.txt" },
    { label: "calendar.txt", file: "calendar.txt" },
    { label: "routes.txt", file: "routes.txt" },
    { label: "stops.txt", file: "stops.txt" },
  ];

  // Pre-generados desde la misma API de Actio (endpoints /api/feed/{feedId}/directions,
  // trajectory, timetable, infoTrip/{tripId}). Se sirven estáticos porque
  // reconstruirlos en vivo son cientos de peticiones al upstream por request.
  const prebuiltFiles = [
    { label: "gtfs-static.zip (bundle completo con shapes+trips+stop_times)", path: "/gtfs-static.zip" },
    { label: "trips.txt", path: "/gtfs/trips.txt" },
    { label: "stop_times.txt", path: "/gtfs/stop_times.txt" },
    { label: "shapes.txt", path: "/gtfs/shapes.txt" },
    { label: "calendar_dates.txt", path: "/gtfs/calendar_dates.txt" },
  ];

  const realtime = [
    {
      title: "VehiclePositions",
      desc: "Posiciones GPS de los autobuses reconstruidas desde /arrivals.",
      pb: `${rtBase}/gtfs-rt`,
      json: `${rtBase}/gtfs-rt?format=json`,
    },
    {
      title: "TripUpdates",
      desc: "Tiempos estimados por viaje, agregando llegadas por parada.",
      pb: `${rtBase}/gtfs-rt-trip-updates`,
      json: `${rtBase}/gtfs-rt-trip-updates?format=json`,
    },
    {
      title: "ServiceAlerts",
      desc: "Alertas de servicio mapeadas desde /alert/list.",
      pb: `${rtBase}/gtfs-rt-alerts`,
      json: `${rtBase}/gtfs-rt-alerts?format=json`,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">GTFS ACTIOSAE</h1>
      <p className="mt-2 text-muted-foreground">
        Feeds GTFS estáticos y realtime generados en vivo desde la API BFF de
        Actio SAE (feed <code>arroyo</code>). Los <code>route_id</code> y{" "}
        <code>stop_id</code> coinciden con los del realtime.
      </p>

      <h2 className="mt-6 text-xl font-bold">GTFS estático (reconstruido)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Generado on-demand desde <code>/route/list</code> y <code>/stop/list</code>. Incluye
        agency, feed_info, calendar sintético, routes y stops.
      </p>
      <div className="mt-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ul className="space-y-1">
          {staticFiles.map((f) => {
            const url = `${origin}/api/public/actiosae/gtfs/${f.file}`;
            return (
              <li key={f.file}>
                <span className="text-muted-foreground">{f.label}: </span>
                <a className="font-mono text-primary hover:underline" href={url}>
                  {url}
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <h2 className="mt-6 text-xl font-bold">GTFS estático (pre-generado)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <code>trips</code>, <code>stop_times</code> y <code>shapes</code> se pre-generan desde los
        endpoints ocultos <code>/api/feed/arroyo/directions</code>,{" "}
        <code>trajectory</code>, <code>timetable</code> y{" "}
        <code>infoTrip/&#123;tripId&#125;</code> (cientos de peticiones al upstream, imposible en
        vivo por request). Servidos estáticos con CORS abierto.
      </p>
      <div className="mt-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ul className="space-y-1">
          {prebuiltFiles.map((f) => {
            const url = `${origin}${f.path}`;
            return (
              <li key={f.path}>
                <span className="text-muted-foreground">{f.label}: </span>
                <a className="font-mono text-primary hover:underline" href={url}>
                  {url}
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <h2 className="mt-8 text-xl font-bold">GTFS-Realtime</h2>
      <div className="mt-3 grid gap-4">
        {realtime.map((f) => (
          <div key={f.title} className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-lg font-semibold">{f.title}</h3>
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

      <h2 className="mt-8 text-xl font-bold">Proxy BFF crudo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Endpoints originales de Actio SAE (JSON), con los headers Android
        inyectados por el proxy. Ejemplos:
      </p>
      <div className="mt-3 rounded-lg border border-border bg-card p-4 text-sm">
        <ul className="space-y-1 font-mono">
          <li>{rtBase}/actio?path=route/list</li>
          <li>{rtBase}/actio?path=stop/list</li>
          <li>{rtBase}/actio?path=arrivals/{`{stopId}`}</li>
          <li>{rtBase}/actio?path=vehiclePosition</li>
          <li>{rtBase}/actio?path=alert/list</li>
        </ul>
      </div>
    </div>
  );
}