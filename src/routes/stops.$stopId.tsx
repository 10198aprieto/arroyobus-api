import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { actioGet } from "@/lib/api";

export const Route = createFileRoute("/stops/$stopId")({ component: StopInfoPage });

function StopInfoPage() {
  const { stopId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["stopInfo", stopId],
    queryFn: () => actioGet<unknown>(`stopInfo/${stopId}`),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Parada {stopId}</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        GET /bff/mobile/stopInfo/{stopId}
      </p>
      <div className="mt-3 flex gap-2">
        <Link to="/stops" className="text-sm text-primary hover:underline">← Paradas</Link>
        <Link
          to="/arrivals/$stopId"
          params={{ stopId }}
          className="text-sm text-primary hover:underline"
        >
          Ver llegadas →
        </Link>
      </div>
      {isLoading && <p className="mt-4 text-muted-foreground">Cargando…</p>}
      {error && <p className="mt-4 text-destructive">{(error as Error).message}</p>}
      {data != null && (
        <pre className="mt-4 overflow-auto rounded-lg border border-border bg-card p-4 text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}