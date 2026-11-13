# Project conventions

- Use the shared Arroyobus visual system in `src/styles.css` and `AppShell` for all public pages, so navigation, accessibility, and branding stay consistent.
- Fleet plate lookups live in one browser-safe module, `src/lib/fleet.ts`; render any bus with `busLabel()` so a plate always accompanies the fleet number. Backend copies of the map stay in the functions that emit them.
- Existing realtime functions keep pure schedule resolvers inline for independent deployment; regression tests exercise both copies against the published static dataset conventions.
- Operator-specific private alert management reuses the admin AlertsPanel and `alerts.feed`; public delivery extends the existing alerts function with isolated caches and operator-specific static selectors.
- Health observations are append-only public operational data written only by authenticated managed callbacks; exports derive daily summaries and incidents from real samples and never infer continuity across monitoring gaps.
