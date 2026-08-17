// Minimal protobuf writer for GTFS-Realtime FeedMessage (ServiceAlerts).
export class PbWriter {
  private chunks: number[] = [];
  bytes() { return new Uint8Array(this.chunks); }
  private vi(v: number) {
    let n = v >>> 0;
    while (n > 0x7f) { this.chunks.push((n & 0x7f) | 0x80); n >>>= 7; }
    this.chunks.push(n & 0x7f);
  }
  private vi64(v: number) {
    let lo = v >>> 0, hi = Math.floor(v / 0x100000000) >>> 0;
    while (hi > 0 || lo > 0x7f) {
      this.chunks.push((lo & 0x7f) | 0x80);
      const carry = (hi & 0x7f) << 25;
      lo = ((lo >>> 7) | carry) >>> 0;
      hi >>>= 7;
    }
    this.chunks.push(lo & 0x7f);
  }
  tagVarint(field: number, value: number) {
    this.vi((field << 3) | 0);
    if (value > 0xffffffff) this.vi64(value); else this.vi(value);
  }
  tagString(field: number, value: string) {
    this.vi((field << 3) | 2);
    const b = new TextEncoder().encode(value);
    this.vi(b.length);
    for (const x of b) this.chunks.push(x);
  }
  tagMessage(field: number, sub: Uint8Array) {
    this.vi((field << 3) | 2);
    this.vi(sub.length);
    for (const x of sub) this.chunks.push(x);
  }
}

export const AGENCY_ID = "laregional";

export type AlertRow = {
  id: string;
  header: string;
  description: string;
  cause: number;
  effect: number;
  route_ids: string[];
  stop_ids: string[];
  url: string | null;
  start_at: string;
  end_at: string | null;
};

function translated(text: string, lang = "es"): Uint8Array {
  const w = new PbWriter();
  const t = new PbWriter();
  t.tagString(1, text);
  t.tagString(2, lang);
  w.tagMessage(1, t.bytes());
  return w.bytes();
}

function ts(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

function selector(sel: { routeId?: string; stopId?: string }): Uint8Array {
  const w = new PbWriter();
  if (sel.routeId) w.tagString(3, sel.routeId);
  else if (sel.stopId) w.tagString(5, sel.stopId);
  else w.tagString(1, AGENCY_ID);
  return w.bytes();
}

function encAlert(a: AlertRow): Uint8Array {
  const w = new PbWriter();
  const ap = new PbWriter();
  const s = ts(a.start_at), e = ts(a.end_at);
  if (s !== null) ap.tagVarint(1, s);
  if (e !== null) ap.tagVarint(2, e);
  const apb = ap.bytes();
  if (apb.length > 0) w.tagMessage(1, apb);

  const sels = [
    ...(a.route_ids ?? []).map((routeId) => ({ routeId })),
    ...(a.stop_ids ?? []).map((stopId) => ({ stopId })),
  ];
  for (const sel of sels.length ? sels : [{}]) w.tagMessage(5, selector(sel));

  w.tagVarint(6, a.cause || 1);
  w.tagVarint(7, a.effect || 7);
  if (a.url) w.tagMessage(9, translated(a.url));
  if (a.header) w.tagMessage(10, translated(a.header));
  if (a.description) w.tagMessage(11, translated(a.description));
  return w.bytes();
}

export function encodeAlertsFeed(alerts: AlertRow[], feedTs: number): Uint8Array {
  const w = new PbWriter();
  const h = new PbWriter();
  h.tagString(1, "2.0");
  h.tagVarint(2, 0);
  h.tagVarint(3, feedTs);
  w.tagMessage(1, h.bytes());
  for (const a of alerts) {
    const e = new PbWriter();
    e.tagString(1, a.id);
    e.tagMessage(5, encAlert(a));
    w.tagMessage(2, e.bytes());
  }
  return w.bytes();
}

export const CAUSES: { value: number; label: string }[] = [
  { value: 1, label: "Causa desconocida" },
  { value: 2, label: "Otra causa" },
  { value: 3, label: "Problema técnico" },
  { value: 4, label: "Huelga" },
  { value: 5, label: "Manifestación" },
  { value: 6, label: "Accidente" },
  { value: 7, label: "Festivo" },
  { value: 8, label: "Condiciones meteorológicas" },
  { value: 9, label: "Mantenimiento" },
  { value: 10, label: "Obras" },
  { value: 11, label: "Actividad policial" },
  { value: 12, label: "Emergencia médica" },
];

export const EFFECTS: { value: number; label: string }[] = [
  { value: 8, label: "Efecto desconocido" },
  { value: 7, label: "Otro efecto" },
  { value: 1, label: "Sin servicio" },
  { value: 2, label: "Servicio reducido" },
  { value: 3, label: "Retrasos importantes" },
  { value: 4, label: "Desvío" },
  { value: 5, label: "Servicio adicional" },
  { value: 6, label: "Servicio modificado" },
  { value: 9, label: "Traslado de parada" },
  { value: 10, label: "Sin afectación" },
  { value: 11, label: "Problema de accesibilidad" },
];
