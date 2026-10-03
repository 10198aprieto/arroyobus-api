import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/status")({
  component: StatusPage,
  head: () => ({
    meta: [
      { title: "Estado, CORS y límites de uso — Arroyobus Open Data" },
      {
        name: "description",
        content:
          "Estado en vivo de los feeds GTFS-Realtime, GTFS estático y la API de ActioSAE, más la política de CORS y los límites de uso de la API abierta de Arroyobus.",
      },
      { property: "og:title", content: "Estado, CORS y límites de uso — Arroyobus Open Data" },
      {
        property: "og:description",
        content:
          "Health check público de los feeds GTFS-RT, el GTFS estático y ActioSAE, con la política de CORS y rate limiting documentada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://arroyobus-api.lovable.app/status" },
    ],
    links: [{ rel: "canonical", href: "https://arroyobus-api.lovable.app/status" }],
  }),
});

type CheckStatus = "ok" | "degraded" | "down";

interface Check {
  id: string;
  group: string;
  name: string;
  url: string;
  status: CheckStatus;
  http_status: number | null;
  latency_ms: number;
  entities?: number;
  age_seconds?: number | null;
  note?: string;
}

interface Health {
  status: CheckStatus;
  generated_at: string;
  took_ms: number;
  summary: { total: number; ok: number; degraded: number; down: number };
  checks: Check[];
}

const GROUPS: { id: string; label: string }[] = [
  { id: "gtfs-rt", label: "GTFS-Realtime" },
  { id: "gtfs-static", label: "GTFS estático" },
  { id: "api", label: "API propia" },
  { id: "actiosae", label: "ActioSAE (origen)" },
];

const LABEL: Record<CheckStatus, string> = {
  ok: "Operativo",
  degraded: "Sin datos",
  down: "Caído",
};

function Dot({ status }: { status: CheckStatus }) {
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-500"
        : "bg-destructive";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

function StatusPage() {
  const { data, isLoading, error } = useQuery<Health>({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/public/health");
      return (await r.json()) as Health;
    },
    refetchInterval: 30_000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Estado de la API</h1>
      <p className="mt-2 text-muted-foreground">
        Comprobación en vivo de los tres feeds GTFS-Realtime, el GTFS estático, la API
        propia y la API de ActioSAE. Se actualiza cada 30 segundos.
      </p>

      <div className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
        <span className="text-muted-foreground">Endpoint: </span>
        <a
          className="font-mono text-primary hover:underline"
          href="/api/public/health"
        >
          /api/public/health
        </a>
        <p className="mt-2 text-muted-foreground">
          Devuelve JSON con el estado de cada comprobación (siempre código{" "}
          <code>200</code>; el estado real va en el campo <code>status</code> y en la
          cabecera <code>X-Health-Status</code>). Para monitores de uptime usa{" "}
          <code>?strict=1</code>: responde <code>503</code> si algo está caído.
        </p>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Comprobando…</p>}
      {error && (
        <p className="mt-6 text-sm text-destructive">No se pudo cargar el estado.</p>
      )}

      {data && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
            <Dot status={data.status} />
            <span className="font-semibold">{LABEL[data.status]}</span>
            <span className="text-sm text-muted-foreground">
              {data.summary.ok} operativos · {data.summary.degraded} sin datos ·{" "}
              {data.summary.down} caídos · {data.took_ms} ms
            </span>
          </div>

          {GROUPS.map((g) => {
            const items = data.checks.filter((c) => c.group === g.id);
            if (items.length === 0) return null;
            return (
              <div key={g.id} className="mt-6">
                <h2 className="text-lg font-semibold">{g.label}</h2>
                <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-card">
                  {items.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <Dot status={c.status} />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">
                        {c.http_status ?? "—"} · {c.latency_ms} ms
                        {typeof c.entities === "number" ? ` · ${c.entities} entidades` : ""}
                        {typeof c.age_seconds === "number" ? ` · ${c.age_seconds}s de antigüedad` : ""}
                      </span>
                      {c.note && (
                        <span className="w-full text-xs text-muted-foreground">{c.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      <h2 className="mt-10 text-xl font-bold">CORS</h2>
      <div className="mt-2 rounded-lg border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">
          Todos los recursos públicos (<code>/gtfs/*</code>, <code>/gtfs-static.zip</code>,{" "}
          <code>/api/public/*</code> y los feeds GTFS-RT) se pueden consumir desde
          cualquier web, sin proxy intermedio.
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs">
          <li>Access-Control-Allow-Origin: *</li>
          <li>Access-Control-Allow-Methods: GET, HEAD, OPTIONS</li>
          <li>Access-Control-Allow-Headers: Content-Type, Authorization, Accept, Origin</li>
          <li>Access-Control-Max-Age: 86400</li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          Las peticiones <code>OPTIONS</code> (preflight) responden <code>204</code>. No se
          admiten credenciales (<code>credentials: "include"</code>): no hacen falta, los
          datos son abiertos.
        </p>
      </div>

      <h2 className="mt-8 text-xl font-bold">Límites de uso</h2>
      <div className="mt-2 rounded-lg border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">
          No hay límite duro por ahora, pero sí una política de uso razonable. Si un
          cliente la incumple de forma sostenida, se puede bloquear por IP.
        </p>
        <ul className="mt-3 space-y-1">
          <li>· Máximo orientativo: <strong>120 peticiones por minuto</strong> e IP.</li>
          <li>· GTFS-Realtime: como mucho <strong>1 petición por segundo</strong> por feed (los datos se refrescan cada ~0,5 s).</li>
          <li>· GTFS estático: como mucho <strong>1 descarga por hora</strong>; cachea el ZIP en tu servidor.</li>
          <li>· Identifícate con un <code>User-Agent</code> propio (nombre del proyecto y forma de contacto).</li>
          <li>· Respeta <code>Cache-Control</code> y usa <code>ETag</code> / <code>If-None-Match</code> cuando esté disponible.</li>
        </ul>
        <p className="mt-3 text-muted-foreground">
          Si necesitas un volumen mayor o una integración estable, avisa antes en vez de
          machacar los endpoints.
        </p>
      </div>
    </div>
  );
}
