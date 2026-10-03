import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, ArrowRight, Bell, BusFront, Database, HeartHandshake, Map, MapPin, Route as RouteIcon, Search, Send, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";

const TITLE = "Arroyobus Open Data — GTFS y API en tiempo real";
const DESC =
  "Datos abiertos de Arroyobus: GTFS estático, GTFS-Realtime, líneas, paradas, llegadas, vehículos y alertas.";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://arroyobus-api.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://arroyobus-api.lovable.app/" }],
  }),
});

const SECTIONS = [
  { to: "/routes", title: "Líneas", text: "Recorridos, nombres y colores oficiales de la red.", meta: "GET · route/list", icon: RouteIcon, tone: "primary" },
  { to: "/stops", title: "Paradas", text: "Busca una parada y consulta sus próximas llegadas.", meta: "GET · stop/list", icon: MapPin, tone: "blue" },
  { to: "/vehicles", title: "Vehículos en vivo", text: "Posición de los autobuses con actualización continua.", meta: "TIEMPO REAL", icon: BusFront, tone: "lime" },
  { to: "/alerts", title: "Alertas", text: "Avisos e incidencias que afectan al servicio.", meta: "GET · alert/list", icon: Bell, tone: "warning" },
  { to: "/gtfs-rt", title: "Feeds GTFS-RT", text: "Vehicle Positions, Trip Updates y Service Alerts.", meta: "PROTOBUF + JSON", icon: Activity, tone: "blue" },
  { to: "/explorer", title: "Mapa interactivo", text: "Explora endpoints, paradas y vehículos sobre el mapa.", meta: "EXPLORER", icon: Map, tone: "featured" },
  { to: "/actiosae", title: "GTFS ACTIOSAE", text: "Datos estáticos y en tiempo real del origen ActioSAE.", meta: "DATASET", icon: Database, tone: "primary" },
  { to: "/status", title: "Estado de la API", text: "Salud de todos los feeds, CORS y límites de uso.", meta: "HEALTH CHECK", icon: ShieldCheck, tone: "lime" },
  { to: "/tad", title: "Petición TAD", text: "Envía solicitudes de transporte a demanda.", meta: "POST", icon: Send, tone: "blue" },
  { to: "/suggestion", title: "Sugerencias", text: "Envía comentarios y propuestas sobre el servicio.", meta: "CONTACTO", icon: HeartHandshake, tone: "primary" },
] as const;

function Index() {
  const [query, setQuery] = useState("");
  const visibleSections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    if (!normalized) return SECTIONS;
    return SECTIONS.filter(({ title, text, meta }) => `${title} ${text} ${meta}`.toLocaleLowerCase("es").includes(normalized));
  }, [query]);

  return (
    <div className="dashboard-home">
      <section className="animate-rise flex flex-col gap-7 pb-9 pt-2 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary"><span className="status-pulse h-2 w-2 rounded-full bg-primary" /> Datos abiertos y en directo</div>
          <h1 className="font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl">La red Arroyobus, <span className="text-primary">en tus manos.</span></h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">Consulta líneas, paradas y autobuses en vivo, o conecta tus proyectos con nuestros datos GTFS.</p>
        </div>
        <label className="relative block w-full shrink-0 md:w-80">
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Buscar una sección</span>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar datos o herramientas…" className="h-12 rounded-lg border-border/80 bg-card/80 pl-12 pr-4 shadow-soft backdrop-blur-md" />
        </label>
      </section>

      <section aria-label="Accesos a datos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSections.map(({ to, title, text, meta, icon: Icon, tone }, index) => (
          <Link key={to} to={to} style={{ animationDelay: `${Math.min(index * 55, 330)}ms` }} className={`dashboard-tile tone-${tone} group animate-card-in relative flex min-h-56 flex-col overflow-hidden rounded-lg border border-border/70 bg-card/85 p-6 opacity-0 shadow-soft backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
            <div className="tile-icon mb-6 flex h-12 w-12 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-105"><Icon className="h-6 w-6" aria-hidden="true" /></div>
            <span className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{meta}</span>
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">Abrir sección <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" /></span>
          </Link>
        ))}
      </section>
      {visibleSections.length === 0 && <div className="rounded-lg border border-dashed border-border bg-card/60 px-6 py-14 text-center text-muted-foreground">No hay ninguna sección que coincida con “{query}”.</div>}
      <Link to="/status" className="animate-rise mt-8 flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 px-5 py-4 text-sm transition-colors hover:bg-primary/10 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-3 font-medium text-foreground"><span className="status-pulse h-2.5 w-2.5 rounded-full bg-primary" /> Consulta el estado en directo de todos los servicios</span>
        <span className="inline-flex items-center gap-2 font-semibold text-primary">Ver estado <ArrowRight className="h-4 w-4" /></span>
      </Link>
    </div>
  );
}
