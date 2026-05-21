import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { actioGet } from "@/lib/api";

export const Route = createFileRoute("/vehicles")({ component: VehiclesPage });

interface VPResp {
  gpsPositions: Array<Record<string, unknown>>;
  message?: string;
}

function VehiclesPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vehiclePosition"],
    queryFn: () => actioGet<VPResp>("vehiclePosition"),
    refetchInterval: 10_000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Vehículos (tiempo real)</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">GET /bff/mobile/vehiclePosition</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Si el endpoint nativo devuelve vacío, esta vista muestra automáticamente
        posiciones GPS reconstruidas a partir de las llegadas. También están en{" "}
        <a className="text-primary hover:underline" href="/gtfs-rt">GTFS-RT</a>.
      </p>
      <button
        onClick={() => refetch()}
        className="mt-4 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
      >
        {isFetching ? "Recargando…" : "Recargar"}
      </button>
      {isLoading && <p className="mt-4 text-muted-foreground">Cargando…</p>}
      {error && <p className="mt-4 text-destructive">{(error as Error).message}</p>}
      {data && (
        <>
          <p className="mt-4 text-sm">
            <strong>{data.gpsPositions?.length ?? 0}</strong> vehículo(s)
            {data.message ? ` · ${data.message}` : ""}
          </p>
          <pre className="mt-2 overflow-auto rounded-lg border border-border bg-card p-4 text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}