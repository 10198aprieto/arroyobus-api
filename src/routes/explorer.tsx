import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { actioGet } from "@/lib/api";

const MapView = lazy(() => import("@/components/explorer-map"));

export const Route = createFileRoute("/explorer")({
  ssr: false,
  component: ExplorerPage,
});

type EndpointKey = "route/list" | "stop/list" | "arrivals" | "vehiclePosition" | "alert/list" | "stopInfo";

interface EP {
  key: EndpointKey;
  label: string;
  path: (p: Record<string, string>) => string;
  params: { name: string; placeholder?: string; required?: boolean }[];
  refresh?: number;
}

const ENDPOINTS: EP[] = [
  { key: "route/list", label: "GET /route/list", path: () => "route/list", params: [] },
  { key: "stop/list", label: "GET /stop/list", path: () => "stop/list", params: [] },
  { key: "stopInfo", label: "GET /stopInfo/{stopId}", path: (p) => `stopInfo/${p.stopId}`, params: [{ name: "stopId", required: true, placeholder: "p.ej. 1" }] },
  { key: "arrivals", label: "GET /arrivals/{stopId}", path: (p) => `arrivals/${p.stopId}`, params: [{ name: "stopId", required: true, placeholder: "p.ej. 1" }], refresh: 15000 },
  { key: "vehiclePosition", label: "GET /vehiclePosition", path: () => "vehiclePosition", params: [], refresh: 10000 },
  { key: "alert/list", label: "GET /alert/list", path: () => "alert/list", params: [] },
];

export interface Stop { stopId: string; stopName?: string; lat?: number | string; lon?: number | string; stopLat?: number | string; stopLon?: number | string }
export interface Vehicle { vehicleId?: string; lat?: number; lon?: number; latitude?: number; longitude?: number; bearing?: number; timestamp?: string; gpsTimestamp?: string; routeId?: string; tripId?: string }

function toCoord(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function ExplorerPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [epKey, setEpKey] = useState<EndpointKey>("stop/list");
  const ep = useMemo(() => ENDPOINTS.find((e) => e.key === epKey)!, [epKey]);
  const [params, setParams] = useState<Record<string, string>>({});
  const [data, setData] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tick, setTick] = useState(0);

  async function run() {
    setLoading(true);
    setErr(null);
    try {
      const path = ep.path(params);
      const json = await actioGet(path);
      setData(json);
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // auto-run when endpoint changes (if all required params filled)
    const ok = ep.params.every((p) => !p.required || params[p.name]);
    if (ok) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epKey, tick]);

  useEffect(() => {
    if (!autoRefresh || !ep.refresh) return;
    const id = setInterval(() => setTick((t) => t + 1), ep.refresh);
    return () => clearInterval(id);
  }, [autoRefresh, ep.refresh]);

  // Derive map data
  const { stops, arrivals, vehicles } = useMemo(() => {
    let stops: Stop[] = [];
    let arrivals: { stop?: Stop } | null = null;
    let vehicles: Vehicle[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = data;
    if (epKey === "stop/list" && d?.stops) stops = d.stops;
    if (epKey === "stopInfo" && d) stops = [d as Stop];
    if (epKey === "vehiclePosition") {
      const raw = (d?.gpsPositions ?? []) as Vehicle[];
      vehicles = raw;
    }
    return { stops, arrivals, vehicles };
  }, [data, epKey]);

  const mapPoints = useMemo<[number, number][]>(() => {
    const out: [number, number][] = [];
    for (const s of stops) {
      const la = toCoord(s.lat ?? s.stopLat), lo = toCoord(s.lon ?? s.stopLon);
      if (la && lo) out.push([la, lo]);
    }
    for (const v of vehicles) {
      const la = v.lat ?? v.latitude, lo = v.lon ?? v.longitude;
      if (la && lo) out.push([la, lo]);
    }
    return out;
  }, [stops, vehicles]);

  const showMap = mapPoints.length > 0 || epKey === "vehiclePosition" || epKey === "stop/list";

  return (
    <div>
      <h1 className="text-2xl font-bold">Endpoint Explorer</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prueba cualquier endpoint, edita parámetros y visualiza el resultado en el mapa.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border border-border bg-card p-3">
          <label className="text-xs font-medium uppercase text-muted-foreground">Endpoint</label>
          <select
            value={epKey}
            onChange={(e) => { setParams({}); setEpKey(e.target.value as EndpointKey); }}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {ENDPOINTS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>

          {ep.params.map((p) => (
            <div key={p.name} className="mt-3">
              <label className="text-xs font-medium">{p.name}{p.required && " *"}</label>
              <input
                value={params[p.name] ?? ""}
                onChange={(e) => setParams((q) => ({ ...q, [p.name]: e.target.value }))}
                placeholder={p.placeholder}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          ))}

          <button
            onClick={run}
            disabled={loading}
            className="mt-3 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Ejecutar"}
          </button>

          {ep.refresh && (
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              Auto-refresh cada {ep.refresh / 1000}s
            </label>
          )}

          <div className="mt-3 break-all font-mono text-[10px] text-muted-foreground">
            {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/actio?path=${ep.path(params)}`}
          </div>
        </aside>

        <section className="space-y-3">
          {showMap && mounted && (
            <div className="h-[400px] overflow-hidden rounded-lg border border-border">
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando mapa…</div>}>
                <MapView stops={stops} vehicles={vehicles} />
              </Suspense>
              <div className="border-t border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                {stops.length > 0 && `${stops.length} parada(s) · `}
                {vehicles.length > 0 && `${vehicles.length} vehículo(s)${epKey === "vehiclePosition" && !((data as { gpsPositions?: unknown[] })?.gpsPositions?.length) ? " (reconstruidos desde GTFS-RT)" : ""}`}
              </div>
            </div>
          )}

          {err && <pre className="rounded-lg border border-destructive bg-destructive/10 p-3 text-xs text-destructive">{err}</pre>}

          <details open className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Respuesta JSON</summary>
            <pre className="max-h-[500px] overflow-auto border-t border-border p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>
          </details>
        </section>
      </div>
    </div>
  );
}