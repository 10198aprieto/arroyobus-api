import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { actioGet } from "@/lib/api";

export const Route = createFileRoute("/vehicles")({
  component: VehiclesPage,
  head: () => ({
    meta: [
      { title: "Vehículos en tiempo real — Arroyobus" },
      { name: "description", content: "Posiciones GPS en vivo de los autobuses de Arroyobus, actualizadas cada pocos segundos." },
      { property: "og:title", content: "Vehículos en tiempo real — Arroyobus" },
      { property: "og:description", content: "Posiciones GPS en vivo de los autobuses de Arroyobus." },
      { property: "og:url", content: "https://arroyobus-api.lovable.app/vehicles" },
    ],
    links: [{ rel: "canonical", href: "https://arroyobus-api.lovable.app/vehicles" }],
  }),
});

interface VPResp {
  gpsPositions: Array<Record<string, unknown>>;
  message?: string;
}

function VehiclesPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vehiclePosition"],
    queryFn: () => actioGet<VPResp>("vehiclePosition"),
    refetchInterval: 1_000,
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
          {(data.gpsPositions?.length ?? 0) === 0 && (
            <div className="mt-4 rounded-lg border border-border bg-muted p-4">
              <p className="font-medium text-foreground">No hay buses reportando ahora mismo</p>
              <p className="mt-1 text-sm text-muted-foreground">
                El operador no está devolviendo posiciones GPS en este momento.
                Esto suele ocurrir cuando los conductores no han iniciado sesión en el sistema de a bordo
                o el servidor del operador tiene los equipos desconectados.
                En cuanto vuelvan a reportar, esta página se actualizará sola.
              </p>
            </div>
          )}
          <pre className="mt-4 overflow-auto rounded-lg border border-border bg-card p-4 text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}