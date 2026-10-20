import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { actioGet } from "@/lib/api";
import { busLabel, plateFor } from "@/lib/fleet";

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
          {(data.gpsPositions?.length ?? 0) > 0 && (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
              {(data.gpsPositions ?? []).map((v, i) => {
                const id = String(v.vehicleId ?? "");
                const plate = typeof v.licensePlate === "string" ? v.licensePlate : plateFor(id);
                const route = String(v.routeShortName ?? v.routeId ?? "");
                const ts = String(v.gpsTimestamp ?? v.timestamp ?? "");
                const time = ts
                  ? new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                  : "";
                return (
                  <li key={`${id || "bus"}-${i}`} className="flex items-center gap-3 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {id || "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-semibold">{busLabel(id, plate)}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {route ? `Línea ${route}` : "sin línea"}
                        {time ? ` · ${time}` : ""}
                      </div>
                    </div>
                    {plate && (
                      <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs">
                        {plate}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <details className="mt-4 rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Respuesta JSON</summary>
            <pre className="max-h-[500px] overflow-auto border-t border-border p-3 text-xs">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}