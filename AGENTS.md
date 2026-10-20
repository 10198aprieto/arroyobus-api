# Project conventions

- Use the shared Arroyobus visual system in `src/styles.css` and `AppShell` for all public pages, so navigation, accessibility, and branding stay consistent.
- Fleet plate lookups live in one browser-safe module, `src/lib/fleet.ts`; render any bus with `busLabel()` so a plate always accompanies the fleet number. Backend copies of the map stay in the functions that emit them.
