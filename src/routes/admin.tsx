import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: AdminPage,
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
    </div>
  );
}
