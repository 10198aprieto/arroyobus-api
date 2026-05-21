import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import type { Stop, Vehicle } from "@/routes/explorer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
  }, [points, map]);
  return null;
}

function toCoord(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default function ExplorerMap({ stops, vehicles }: { stops: Stop[]; vehicles: Vehicle[] }) {
  const pts: [number, number][] = [];
  for (const s of stops) {
    const la = toCoord(s.lat ?? s.stopLat), lo = toCoord(s.lon ?? s.stopLon);
    if (la && lo) pts.push([la, lo]);
  }
  for (const v of vehicles) {
    const la = v.lat ?? v.latitude, lo = v.lon ?? v.longitude;
    if (la && lo) pts.push([la, lo]);
  }
  const center: [number, number] = pts[0] ?? [41.6201, -4.7674];

  return (
    <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds points={pts} />
      {stops.map((s) => {
        const la = s.lat ?? s.stopLat, lo = s.lon ?? s.stopLon;
        if (!la || !lo) return null;
        return (
          <CircleMarker key={s.stopId} center={[la, lo]} radius={6} pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.8 }}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">{s.stopName ?? s.stopId}</div>
                <div>id: {s.stopId}</div>
                <a href={`/arrivals/${s.stopId}`} className="text-blue-600 underline">Ver llegadas</a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      {vehicles.map((v, i) => {
        const la = v.lat ?? v.latitude, lo = v.lon ?? v.longitude;
        if (!la || !lo) return null;
        return (
          <Marker key={`${v.vehicleId ?? i}`} position={[la, lo]}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold">Bus {v.vehicleId ?? "?"}</div>
                {v.routeId && <div>Línea: {v.routeId}</div>}
                {v.tripId && <div>Trip: {v.tripId}</div>}
                {v.timestamp && <div>{new Date(v.timestamp).toLocaleTimeString("es-ES")}</div>}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}