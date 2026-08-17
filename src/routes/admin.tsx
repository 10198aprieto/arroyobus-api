import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CAUSES, EFFECTS } from "@/lib/gtfs-pb";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Panel de publicidad — Arroyobus" },
      { name: "description", content: "Gestión de anuncios para las pantallas embarcadas de Arroyobus." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Ad = {
  id: string;
  url: string;
  activo: boolean;
  orden: number;
  created_at: string;
};

const VIDEO_RE = /\.(mp4|webm|ogg|mov)(\?|#|$)/i;

function AdminPage() {
  const [session, setSession] = useState<null | { email: string }>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ? { email: data.session.user.email ?? "" } : null);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ? { email: s.user.email ?? "" } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) return <div className="text-muted-foreground">Cargando…</div>;
  if (!session) return <Login />;
  return <Dashboard email={session.email} />;
}

function Login() {
  const [email, setEmail] = useState("hola@arroyobus.net");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-border bg-card p-6">
      <h1 className="mb-4 text-lg font-semibold">Panel de administración</h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Contraseña"
          required
        />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ email }: { email: string }) {
  const [tab, setTab] = useState<"ads" | "alerts">("ads");
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("ads")
      .select("*")
      .order("orden", { ascending: true })
      .order("created_at", { ascending: true });
    setAds((data ?? []) as Ad[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addAd(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setBusy(true);
    const nextOrden = (ads[ads.length - 1]?.orden ?? -1) + 1;
    await supabase.from("ads").insert({ url: newUrl.trim(), orden: nextOrden, activo: true });
    setNewUrl("");
    setBusy(false);
    load();
  }

  async function toggle(ad: Ad) {
    await supabase.from("ads").update({ activo: !ad.activo }).eq("id", ad.id);
    load();
  }

  async function remove(ad: Ad) {
    if (!confirm("¿Eliminar este anuncio?")) return;
    await supabase.from("ads").delete().eq("id", ad.id);
    load();
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= ads.length) return;
    const a = ads[index];
    const b = ads[j];
    await Promise.all([
      supabase.from("ads").update({ orden: b.orden }).eq("id", a.id),
      supabase.from("ads").update({ orden: a.orden }).eq("id", b.id),
    ]);
    load();
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Anuncios</h1>
          <p className="text-sm text-muted-foreground">Sesión: {email}</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
        >
          Cerrar sesión
        </button>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["ads", "alerts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {t === "ads" ? "Publicidad" : "Incidencias"}
          </button>
        ))}
      </div>

      {tab === "alerts" ? (
        <AlertsPanel />
      ) : (
      <>
      <form onSubmit={addAd} className="flex gap-2 rounded-lg border border-border bg-card p-4">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          placeholder="https://.../imagen.jpg o video.mp4"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Añadir
        </button>
      </form>

      <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
        Endpoint público: <code className="text-foreground">/api/public/ads</code>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : ads.length === 0 ? (
        <p className="text-muted-foreground">Sin anuncios todavía.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ads.map((ad, i) => {
            const isVideo = VIDEO_RE.test(ad.url);
            return (
              <div
                key={ad.id}
                className={`overflow-hidden rounded-lg border border-border bg-card ${
                  ad.activo ? "" : "opacity-60"
                }`}
              >
                <div className="aspect-video w-full bg-black">
                  {isVideo ? (
                    <video src={ad.url} controls className="h-full w-full object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.url} alt="" className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <p className="break-all text-xs text-muted-foreground">{ad.url}</p>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ad.activo}
                        onChange={() => toggle(ad)}
                      />
                      Activo
                    </label>
                    <span className="text-xs text-muted-foreground">orden {ad.orden}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === ads.length - 1}
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-40"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => remove(ad)}
                      className="flex-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

type AlertRow = {
  id: string;
  header: string;
  description: string;
  cause: number;
  effect: number;
  route_ids: string[];
  stop_ids: string[];
  url: string | null;
  start_at: string;
  end_at: string | null;
  activo: boolean;
};

type StopOpt = { stop_id: string; stop_name: string };
type RouteOpt = { route_id: string; route_short_name: string };

function AlertsPanel() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<RouteOpt[]>([]);
  const [stops, setStops] = useState<StopOpt[]>([]);

  const [header, setHeader] = useState("");
  const [description, setDescription] = useState("");
  const [cause, setCause] = useState(10);
  const [effect, setEffect] = useState(4);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [stopIds, setStopIds] = useState<string[]>([]);
  const [stopQuery, setStopQuery] = useState("");
  const [url, setUrl] = useState("");
  const [endAt, setEndAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false });
    setAlerts((data ?? []) as AlertRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/gtfs/routes.json")
      .then((r) => r.json())
      .then((j) => setRoutes(j as RouteOpt[]))
      .catch(() => {});
    fetch("/gtfs/stops.json")
      .then((r) => r.json())
      .then((j) => setStops(j as StopOpt[]))
      .catch(() => {});
  }, []);

  const stopMatches = stopQuery.trim()
    ? stops
        .filter(
          (s) =>
            !stopIds.includes(s.stop_id) &&
            (s.stop_name.toLowerCase().includes(stopQuery.toLowerCase()) ||
              s.stop_id === stopQuery.trim()),
        )
        .slice(0, 8)
    : [];

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!header.trim()) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("alerts").insert({
      header: header.trim(),
      description: description.trim(),
      cause,
      effect,
      route_ids: routeIds,
      stop_ids: stopIds,
      url: url.trim() || null,
      end_at: endAt ? new Date(endAt).toISOString() : null,
      activo: true,
    });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setHeader("");
    setDescription("");
    setRouteIds([]);
    setStopIds([]);
    setUrl("");
    setEndAt("");
    setMsg("Aviso publicado.");
    load();
  }

  async function toggle(a: AlertRow) {
    await supabase.from("alerts").update({ activo: !a.activo }).eq("id", a.id);
    load();
  }

  async function remove(a: AlertRow) {
    if (!confirm("¿Eliminar esta incidencia?")) return;
    await supabase.from("alerts").delete().eq("id", a.id);
    load();
  }

  const label = (arr: { value: number; label: string }[], v: number) =>
    arr.find((x) => x.value === v)?.label ?? String(v);

  return (
    <div className="space-y-6">
      <form onSubmit={publish} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">Encabezamiento *</label>
          <input
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            placeholder="Desvío por obras en Av. Castilla"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold">Causa</label>
            <select
              value={cause}
              onChange={(e) => setCause(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CAUSES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Efecto</label>
            <select
              value={effect}
              onChange={(e) => setEffect(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {EFFECTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Líneas afectadas (opcional)</label>
          <div className="flex flex-wrap gap-2">
            {routes.map((r) => {
              const on = routeIds.includes(r.route_id);
              return (
                <button
                  type="button"
                  key={r.route_id}
                  onClick={() =>
                    setRouteIds((prev) =>
                      on ? prev.filter((x) => x !== r.route_id) : [...prev, r.route_id],
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-sm ${
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                >
                  {r.route_short_name || r.route_id}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Paradas afectadas (opcional)</label>
          {stopIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {stopIds.map((id) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => setStopIds((prev) => prev.filter((x) => x !== id))}
                  className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs"
                >
                  {stops.find((s) => s.stop_id === id)?.stop_name ?? id} ×
                </button>
              ))}
            </div>
          )}
          <input
            value={stopQuery}
            onChange={(e) => setStopQuery(e.target.value)}
            placeholder="Buscar por nombre o id..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {stopMatches.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-md border border-border">
              {stopMatches.map((s) => (
                <button
                  type="button"
                  key={s.stop_id}
                  onClick={() => {
                    setStopIds((prev) => [...prev, s.stop_id]);
                    setStopQuery("");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="text-muted-foreground">{s.stop_id}</span> — {s.stop_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold">URL (opcional)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Fecha fin (opcional)</label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Publicando…" : "((•)) Publicar aviso"}
        </button>
      </form>

      <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
        Feed GTFS-RT ServiceAlerts propio:{" "}
        <code className="text-foreground">/api/public/alerts</code> ·{" "}
        <code className="text-foreground">/api/public/alerts?format=json</code>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : alerts.length === 0 ? (
        <p className="text-muted-foreground">Sin incidencias todavía.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border border-border bg-card p-4 ${a.activo ? "" : "opacity-60"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{a.header}</p>
                  {a.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {label(CAUSES, a.cause)} · {label(EFFECTS, a.effect)}
                    {a.route_ids?.length ? ` · Líneas: ${a.route_ids.join(", ")}` : ""}
                    {a.stop_ids?.length ? ` · Paradas: ${a.stop_ids.join(", ")}` : ""}
                    {a.end_at ? ` · Hasta ${new Date(a.end_at).toLocaleString("es-ES")}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggle(a)}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    {a.activo ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    onClick={() => remove(a)}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
                  >
                    Borrar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
