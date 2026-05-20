import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { actioGet } from "@/lib/api";

export const Route = createFileRoute("/alerts")({ component: AlertsPage });

interface Alert {
  alertId: string;
  name: string;
  priority?: number;
  startDate?: string;
  endDate?: string;
  url?: string;
  messages?: Array<{ lang: string; title: string; body: string }>;
}

function AlertsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => actioGet<Alert[]>("alert/list"),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Alertas</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">GET /bff/mobile/alert/list</p>
      {isLoading && <p className="mt-4 text-muted-foreground">Cargando…</p>}
      {error && <p className="mt-4 text-destructive">{(error as Error).message}</p>}
      <ul className="mt-4 space-y-3">
        {(data ?? []).map((a) => {
          const msg = a.messages?.find((m) => m.lang === "es") ?? a.messages?.[0];
          return (
            <li key={a.alertId} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">{msg?.title ?? a.name}</h2>
                {a.priority !== undefined && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">
                    prioridad {a.priority}
                  </span>
                )}
              </div>
              {msg?.body && <p className="mt-2 text-sm">{msg.body}</p>}
              <div className="mt-2 text-xs text-muted-foreground">
                {a.startDate?.slice(0, 10)} → {a.endDate?.slice(0, 10)}
              </div>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-primary hover:underline"
                >
                  Más info ↗
                </a>
              )}
            </li>
          );
        })}
        {data && data.length === 0 && (
          <li className="text-sm text-muted-foreground">No hay alertas activas.</li>
        )}
      </ul>
    </div>
  );
}