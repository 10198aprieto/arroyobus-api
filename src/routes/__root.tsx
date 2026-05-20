import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Arroyobus Open Data" },
      { name: "description", content: "Acceso libre a líneas, paradas, llegadas, vehículos y alertas de Arroyobus." },
      { name: "author", content: "Arroyobus Proxy" },
      { property: "og:title", content: "Arroyobus Open Data" },
      { property: "og:description", content: "Acceso libre a líneas, paradas, llegadas, vehículos y alertas de Arroyobus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Arroyobus Open Data" },
      { name: "twitter:description", content: "Acceso libre a líneas, paradas, llegadas, vehículos y alertas de Arroyobus." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Pc7TvDt3YycYbiypl49Z1C8eYV82/social-images/social-1779303317104-Captura_de_pantalla_2026-05-20_205502.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Pc7TvDt3YycYbiypl49Z1C8eYV82/social-images/social-1779303317104-Captura_de_pantalla_2026-05-20_205502.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3">
            <Link to="/" className="mr-4 font-bold text-lg">Arroyobus</Link>
            {[
              ["/routes", "Líneas"],
              ["/stops", "Paradas"],
              ["/vehicles", "Vehículos"],
              ["/alerts", "Alertas"],
              ["/tad", "TAD"],
              ["/suggestion", "Sugerencias"],
              ["/gtfs-rt", "GTFS-RT"],
            ].map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
                activeProps={{ className: "active" }}
              >
                {label}
              </Link>
            ))}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}
