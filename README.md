# 🛰️ ArroyoBus API — Open Data

**Acceso libre a los datos abiertos de ArroyoBus**: líneas, paradas, llegadas en tiempo real, vehículos, alertas y feeds GTFS-RT del transporte urbano y metropolitano de Arroyo de la Encomienda.

Este proyecto actúa como **proxy/BFF** sobre la API interna de ActioSAE (el SAE que da servicio a la flota), normalizando sus datos a estándares abiertos como **GTFS** y **GTFS-Realtime**, y exponiéndolos como API pública en JSON.

🔗 **Web / API:** [arroyobus-api.lovable.app](https://arroyobus-api.lovable.app)

---

## 📚 Endpoints

### App móvil (BFF)

| Recurso | Método | Endpoint |
|---|---|---|
| Líneas | `GET` | `/bff/mobile/route/list` |
| Paradas | `GET` | `/bff/mobile/stop/list` |
| Vehículos en tiempo real | `GET` | `/bff/mobile/vehiclePosition` |
| Alertas | `GET` | `/bff/mobile/alert/list` |
| Petición de Transporte a Demanda (TAD) | `POST` | `/bff/mobile/transportation-request/send` |
| Enviar sugerencia | `POST` | `/bff/mobile/v1.1/send-suggestion` |

Explorador interactivo de estos endpoints: [`/explorer`](https://arroyobus-api.lovable.app/explorer)

### GTFS-Realtime (protobuf)

Compatibles con cualquier consumidor estándar (OneBusAway, OpenTripPlanner, Google Maps, Transit App, etc.). Servidos vía Supabase Edge Functions.

| Feed | Protobuf | JSON debug |
|---|---|---|
| Vehicle Positions | `/functions/v1/gtfs-rt` | `/functions/v1/gtfs-rt?format=json` |
| Trip Updates | `/functions/v1/gtfs-rt-trip-updates` | `/functions/v1/gtfs-rt-trip-updates?format=json` |
| Service Alerts | `/functions/v1/gtfs-rt-alerts` | `/functions/v1/gtfs-rt-alerts?format=json` |

> Base: `https://enzeyiwpoomhlxmcjivn.supabase.co`

Detalle completo en [`/gtfs-rt`](https://arroyobus-api.lovable.app/gtfs-rt).

### GTFS estático

Horarios, paradas, rutas y formas, listos para emparejar con los `trip_id` / `route_id` / `stop_id` del feed en tiempo real.

- **ZIP completo:** [`/gtfs-static.zip`](https://arroyobus-api.lovable.app/gtfs-static.zip)
- **Ficheros `.txt` (estándar GTFS):** `/gtfs/{agency,routes,stops,trips,stop_times,shapes,calendar,calendar_dates,feed_info}.txt`
- **API JSON (REST):** `/api/public/gtfs-static/{agency,routes,stops,trips,stop_times,shapes,calendar,calendar_dates,feed_info}`
- **Ficheros JSON estáticos (CORS abierto):** `/gtfs/{agency,routes,stops,trips,stop_times,shapes,calendar,calendar_dates,feed_info}.json`

### Fuente original (ActioSAE)

Vista de la integración con la API interna de ActioSAE: [`/actiosae`](https://arroyobus-api.lovable.app/actiosae)

---

## 🏗️ Stack

- Aplicación construida con **Lovable** (React + Vite + TailwindCSS) a modo de proxy/panel de datos abiertos.
- Feeds GTFS-Realtime generados y servidos mediante **Supabase Edge Functions**, reconstruyendo posiciones y llegadas a partir de la API interna de **ActioSAE**.
- GTFS estático mantenido a partir de los datos de La Regional (Valladolid).

---

## 🚀 Desarrollo local

```bash
git clone https://github.com/10198aprieto/arroyobus.git
cd arroyobus
npm install
npm run dev
```

---

## 🔗 Proyectos relacionados

- [ArroyoBus](https://arroyobus.net) — web pública y app de seguimiento en tiempo real que consume esta API.

---

## 👤 Autor

Desarrollado y mantenido por **Mateo Fernández Prieto**.

© 2026 Mateo Fernández Prieto · Todos los derechos reservados
