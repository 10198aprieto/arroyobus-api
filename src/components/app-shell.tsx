import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  Bell,
  BusFront,
  ChevronRight,
  CircleUserRound,
  Code2,
  Database,
  Map,
  MapPin,
  Menu,
  MessageSquareText,
  Route as RouteIcon,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/routes", label: "Líneas", icon: RouteIcon },
  { to: "/stops", label: "Paradas", icon: MapPin },
  { to: "/vehicles", label: "Vehículos", icon: BusFront },
  { to: "/alerts", label: "Alertas", icon: Bell },
  { to: "/explorer", label: "Explorar mapa", icon: Map },
  { to: "/gtfs-rt", label: "GTFS-RT", icon: Activity },
  { to: "/actiosae", label: "GTFS ACTIOSAE", icon: Database },
  { to: "/status", label: "Estado", icon: ShieldCheck },
  { to: "/tad", label: "Petición TAD", icon: Send },
  { to: "/suggestion", label: "Sugerencias", icon: MessageSquareText },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-[1000] border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="group flex min-w-0 items-center gap-3" onClick={() => setMenuOpen(false)}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-brand transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
              <BusFront className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 leading-none">
              <strong className="block truncate font-display text-lg">Arroyobus</strong>
              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-widest text-primary">Open Data</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegación principal">
            {NAV_ITEMS.slice(0, 8).map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className="rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-primary/10 [&.active]:text-primary"
                activeProps={{ className: "active" }}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/status" className="hidden items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary sm:flex">
              <span className="status-pulse h-2 w-2 rounded-full bg-primary" /> API activa
            </Link>
            <Button asChild variant="ghost" size="icon" className="hidden lg:inline-flex" title="Administración">
              <Link to="/admin" aria-label="Administración"><CircleUserRound /></Link>
            </Button>
            <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}>
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>

        {menuOpen && (
          <nav className="animate-menu-in border-t border-border bg-card px-4 py-4 lg:hidden" aria-label="Navegación móvil">
            <div className="mx-auto grid max-w-7xl gap-1 sm:grid-cols-2">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground [&.active]:bg-primary/10 [&.active]:text-primary" activeProps={{ className: "active" }}>
                  <Icon className="h-4 w-4" /> {label}<ChevronRight className="ml-auto h-4 w-4 opacity-50" />
                </Link>
              ))}
              <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                <Code2 className="h-4 w-4" /> Administración
              </Link>
            </div>
          </nav>
        )}
      </header>
      <main className="app-content mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
        Datos abiertos de movilidad · Arroyo de la Encomienda
      </footer>
    </div>
  );
}