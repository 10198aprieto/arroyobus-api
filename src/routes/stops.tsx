import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { actioGet } from "@/lib/api";

export const Route = createFileRoute("/stops")({ component: StopsPage });

interface Stop {
  stopId: string;
  stopName?: string;
  stopCode?: string;
  lat?: number;
  lon?: number;
  stopLat?: number;
  stopLon?: number;
}

function StopsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["stops"],
    queryFn: () => actioGet<{ stops: Stop[] }>("stop/list"),
  });
  const stops = data?.stops ?? [];
  const filtered = stops.filter((s) =>
    !q || (s.stopName ?? "").toLowerCase().includes(q.toLowerCase()) || s.stopId.includes(q)
  );

  return (
    <div>
      <h1 className="text-2xl font-bold">Paradas</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">GET /bff/mobile/stop/list</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar parada…"
        className="mt-4 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
      />
      {isLoading && <p className="mt-4 text-muted-foreground">Cargando…</p>}
      {error && <p className="mt-4 text-destructive">{(error as Error).message}</p>}
      <p className="mt-3 text-sm text-muted-foreground">
        {filtered.length} de {stops.length} paradas
      </p>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
        {filtered.map((s) => {
          const latRaw = s.lat ?? s.stopLat;
          const lonRaw = s.lon ?? s.stopLon;
          const lat = latRaw != null ? Number(latRaw) : undefined;
          const lon = lonRaw != null ? Number(lonRaw) : undefined;
          return (
            <li key={s.stopId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.stopName ?? s.stopId}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  id={s.stopId}
                  {s.stopCode ? ` · code=${s.stopCode}` : ""}
                  {Number.isFinite(lat) && Number.isFinite(lon) ? ` · ${lat!.toFixed(5)}, ${lon!.toFixed(5)}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  to="/arrivals/$stopId"
                  params={{ stopId: s.stopId }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                >
                  Llegadas
                </Link>
                <Link
                  to="/stops/$stopId"
                  params={{ stopId: s.stopId }}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium"
                >
                  Info
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}