import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText, Package, Braces, MapPin, Clock } from "lucide-react";

const BASE = "/riobus-4d55e050cef1";
const FILES = ["agency", "calendar", "feed_info", "routes", "stops", "trips", "stop_times", "shapes"];
const STOPS = [
  "Paseo de Filipinos frente Campo Grande",
  "Estación de Autobuses de Valladolid",
  "Paseo Zorrilla 130 junto Centro Comercial",
  "Avenida Medina del Campo 15 (Centro de Salud Arturo Eyries)",
  "Calle Felipe Ruíz Martín (IES José Jiménez Lozano)",
  "Centro Comercial Río Shopping",
];

export const Route = createFileRoute("/riobus")({
  component: RioBusPage,
  head: () => ({
    meta: [
      { title: "RíoBUS — Bus al Centro Comercial Río Shopping" },
      { name: "description", content: "Línea RíoBUS Valladolid – Centro Comercial Río Shopping: paradas, horarios y GTFS en txt, json y zip." },
      { property: "og:title", content: "RíoBUS — Bus al Centro Comercial Río Shopping" },
      { property: "og:description", content: "Paradas y datos GTFS de la línea RíoBUS a Río Shopping." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function RioBusPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-6">
        <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
          La Regional · Línea RíoBUS
        </span>
        <h1 className="mt-3 text-3xl font-bold">RíoBUS: Valladolid ⇄ Río Shopping</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Autobús entre el centro de Valladolid y el Centro Comercial Río Shopping. Laborables, sábados, domingos y festivos.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href={`${BASE}/gtfs.zip`} download className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Package className="h-4 w-4" /> Descargar GTFS (.zip)
          </a>
          <a href={`${BASE}/gtfs-completo.txt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold">
            <FileText className="h-4 w-4" /> Todo junto (.txt)
          </a>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="h-5 w-5 text-primary" /> Recorrido</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {STOPS.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5 text-primary" /> Servicio</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Laborables, sábados y domingos/festivos.</li>
            <li>Operador: La Regional Vallisoletana · 983 308 088</li>
            <li>Avisos en vivo: <a className="text-primary underline" href="/api/public/riobus/alerts?format=json">/api/public/riobus/alerts</a></li>
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Archivos GTFS individuales</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {FILES.map((f) => (
            <div key={f} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-mono">{f}</span>
              <span className="flex gap-3">
                <a href={`${BASE}/${f}.txt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Download className="h-3.5 w-3.5" />txt</a>
                <a href={`${BASE}/${f}.json`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Braces className="h-3.5 w-3.5" />json</a>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
