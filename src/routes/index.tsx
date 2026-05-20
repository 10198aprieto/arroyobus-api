import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Index });

const SECTIONS: Array<[string, string, string]> = [
  ["/routes", "Líneas", "GET /bff/mobile/route/list"],
  ["/stops", "Paradas", "GET /bff/mobile/stop/list"],
  ["/vehicles", "Vehículos en tiempo real", "GET /bff/mobile/vehiclePosition"],
  ["/alerts", "Alertas", "GET /bff/mobile/alert/list"],
  ["/tad", "Petición TAD", "POST /bff/mobile/transportation-request/send"],
  ["/suggestion", "Sugerencias", "POST /bff/mobile/v1.1/send-suggestion"],
  ["/gtfs-rt", "Feeds GTFS-RT", "VehiclePositions y TripUpdates en protobuf"],
];

function Index() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Arroyobus Open Data</h1>
      <p className="mt-2 text-muted-foreground">
        Acceso libre a los datos de la app de Arroyobus. Cada sección expone uno de
        los endpoints internos. Dentro de cada parada puedes consultar las llegadas
        en tiempo real.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {SECTIONS.map(([to, title, desc]) => (
          <Link
            key={to}
            to={to}
            className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
          >
            <div className="font-semibold">{title}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
