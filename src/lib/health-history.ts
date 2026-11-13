export interface Observation {
  id: string;
  observed_at: string;
  source: string;
  status: string;
  vehicle_state: 'reporting' | 'empty' | 'unavailable';
  vehicles: number | null;
  trips: number | null;
  took_ms: number;
}
export function vehicleState(check: { status: string; entities?: number } | undefined): Observation['vehicle_state'] {
  if (!check || check.status === 'down' || check.entities === undefined) return 'unavailable';
  return check.entities === 0 ? 'empty' : 'reporting';
}
export function summarizeHistory(rows: Observation[]) {
  const sorted = [...rows].sort((a,b) => a.observed_at.localeCompare(b.observed_at));
  const days = new Map<string, { date: string; samples: number; empty: number; unavailable: number; reporting: number }>();
  const incidents: { state: string; start: string; last: string; recovered_at: string | null; samples: number }[] = [];
  let active: typeof incidents[number] | undefined;
  let previous: Observation | undefined;
  let gaps = 0;
  for (const row of sorted) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(row.observed_at));
    const day = days.get(date) ?? {date,samples:0,empty:0,unavailable:0,reporting:0};
    day.samples++; day[row.vehicle_state]++; days.set(date,day);
    const gap = previous && Date.parse(row.observed_at)-Date.parse(previous.observed_at)>150_000;
    if (gap) { gaps++; active = undefined; }
    if (row.vehicle_state === 'reporting') {
      if (active) active.recovered_at = row.observed_at;
      active = undefined;
    } else if (active?.state === row.vehicle_state) {
      active.last = row.observed_at; active.samples++;
    } else {
      active = {state:row.vehicle_state,start:row.observed_at,last:row.observed_at,recovered_at:null,samples:1};
      incidents.push(active);
    }
    previous = row;
  }
  return { daily: [...days.values()], incidents, gaps };
}
export function exportRows(rows: Observation[]) {
  const labels = { reporting:'Con buses',empty:'Sin buses',unavailable:'Sin respuesta válida' };
  return rows.map(r => ({Fecha_UTC:r.observed_at,Estado:r.status,Buses:r.vehicles,Viajes:r.trips,Estado_buses:labels[r.vehicle_state],Duracion_comprobacion_ms:r.took_ms,Origen:r.source}));
}
export function historyCsv(rows: Observation[]) {
  const data = exportRows(rows);
  const keys = ['Fecha_UTC','Estado','Buses','Viajes','Estado_buses','Duracion_comprobacion_ms','Origen'];
  const cell = (value: unknown) => '"'+String(value ?? '').replaceAll('"','""')+'"';
  return '\uFEFF'+[keys.map(cell).join(','),...data.map(row => Object.values(row).map(cell).join(','))].join('\r\n');
}