import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { actioGet } from "@/lib/api";

export const Route = createFileRoute("/routes")({ component: RoutesPage });

interface BusRoute {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  routeTextColor: string;
}

function RoutesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["routes"],
    queryFn: () => actioGet<{ routes: BusRoute[] }>("route/list"),
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Líneas</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">GET /bff/mobile/route/list</p>
      {isLoading && <p className="mt-4 text-muted-foreground">Cargando…</p>}
      {error && <p className="mt-4 text-destructive">{(error as Error).message}</p>}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {data?.routes.map((r) => (
          <li
            key={r.routeId}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold"
              style={{ background: `#${r.routeColor}`, color: `#${r.routeTextColor}` }}
            >
              {r.routeShortName}
            </span>
            <div>
              <div className="font-semibold">{r.routeId}</div>
              <div className="text-sm text-muted-foreground">{r.routeLongName}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}