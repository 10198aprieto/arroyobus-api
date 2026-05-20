import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { actioGet } from "@/lib/api";

export const Route = createFileRoute("/arrivals/$stopId")({ component: ArrivalsPage });

interface Arrival {
  tripId?: string;
  tripHeadsign?: string;
  arrivalTime?: string;
  departureTime?: string;
  stopSequence?: string | number;
  vehicleId?: string | null;
  isAproximated?: boolean;
  isEstimated?: boolean;
  route?: { routeId?: string; routeShortName?: string; routeColor?: string; routeTextColor?: string };
}

function fmt(t?: string): string {
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function ArrivalsPage() {
  const { stopId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["arrivals", stopId],
    queryFn: () => actioGet<Arrival[]>(`arrivals/${stopId}`),
    refetchInterval: 15_000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Llegadas a {stopId}</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        GET /bff/mobile/arrivals/{stopId}
      </p>
      <div className="mt-3">
        <Link to="/stops" className="text-sm text-primary hover:underline">← Paradas</Link>
      </div>
      {isLoading && <p className="mt-4 text-muted-foreground">Cargando…</p>}
      {error && <p className="mt-4 text-destructive">{(error as Error).message}</p>}
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
        {(data ?? []).map((a, i) => (
          <li key={`${a.tripId}-${i}`} className="flex items-center gap-3 p-3">
            {a.route?.routeShortName && (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{
                  background: `#${a.route.routeColor ?? "888"}`,
                  color: `#${a.route.routeTextColor ?? "fff"}`,
                }}
              >
                {a.route.routeShortName}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{a.tripHeadsign ?? a.tripId}</div>
              <div className="font-mono text-xs text-muted-foreground">
                trip={a.tripId} · seq={String(a.stopSequence ?? "?")}
                {a.vehicleId ? ` · bus=${a.vehicleId}` : a.isAproximated ? " · aprox." : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg">{fmt(a.arrivalTime)}</div>
              {a.departureTime && a.departureTime !== a.arrivalTime && (
                <div className="font-mono text-xs text-muted-foreground">
                  sal {fmt(a.departureTime)}
                </div>
              )}
            </div>
          </li>
        ))}
        {data && data.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">Sin próximas llegadas.</li>
        )}
      </ul>
    </div>
  );
}