// Matrículas conocidas de la flota (nº de flota -> matrícula).
// Fuente: lista facilitada por el operador. Los buses 6338 y 6342 no tienen matrícula asignada.
export const LICENSE_PLATES: Record<string, string> = {
  "6346": "4772LKL",
  "6372": "1543MPD",
  "6386": "0475NPG",
  "6355": "2575MHS",
  "6352": "2304MHS",
  "6318": "8612JZX",
  "6341": "2384LFB",
};

export function plateFor(vehicleId?: string | null): string | null {
  if (!vehicleId) return null;
  return LICENSE_PLATES[vehicleId] ?? null;
}

// Nombre visible de un bus: "6352 · 2304MHS", o solo el número si no hay matrícula.
export function busLabel(vehicleId?: string | null, licensePlate?: string | null): string {
  const id = vehicleId?.trim() || "?";
  const plate = licensePlate?.trim() || plateFor(id);
  return plate ? `${id} · ${plate}` : id;
}
