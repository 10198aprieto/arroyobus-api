import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Observation } from '@/lib/health-history';
interface History {monitoring_started_at:string|null;rows:Observation[];gaps:number;daily:{date:string;samples:number;empty:number;unavailable:number;reporting:number}[];incidents:{state:string;start:string;last:string;recovered_at:string|null;samples:number}[]}
export function HealthHistory(){
  const [from,setFrom]=useState('');const [to,setTo]=useState('');
  const params=new URLSearchParams();if(from)params.set('from',from);if(to)params.set('to',to);
  const endpoint='/api/public/health-history?'+params;
  const {data,error,isLoading}=useQuery<History>({queryKey:['health-history',from,to],queryFn:async()=>{const r=await fetch(endpoint);if(!r.ok)throw new Error();return r.json();},refetchInterval:60_000});
  const date=(value:string)=>new Date(value).toLocaleString('es-ES',{timeZone:'Europe/Madrid'});
  return <section className="mt-10 border-t border-border pt-6">
    <h2 className="text-xl font-bold">Histórico de disponibilidad</h2>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <label className="text-sm">Desde (UTC)<input aria-label="Desde (UTC)" type="date" className="mt-1 block rounded-md border border-input bg-background p-2" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label className="text-sm">Hasta (UTC)<input aria-label="Hasta (UTC)" type="date" className="mt-1 block rounded-md border border-input bg-background p-2" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <Button asChild variant="outline"><a href={endpoint+'&format=csv'}><Download/>CSV</a></Button>
      <Button asChild variant="outline"><a href={endpoint+'&format=xlsx'}><Download/>XLSX</a></Button>
    </div>
    {isLoading && <p>Cargando histórico…</p>}{error && <p className="text-destructive">No se pudo cargar el histórico.</p>}
    {data && <>
      <p className="text-sm text-muted-foreground">{data.monitoring_started_at?'Registro desde '+date(data.monitoring_started_at):'Todavía no hay observaciones guardadas.'} · Sin registros verificables anteriores.</p>
      <div className="my-5 grid grid-cols-2 gap-4 md:grid-cols-4">{[['Observaciones',data.rows.length],['Sin buses',data.rows.filter(r=>r.vehicle_state==='empty').length],['Sin respuesta válida',data.rows.filter(r=>r.vehicle_state==='unavailable').length],['Huecos de seguimiento',data.gaps]].map(([label,value])=><div key={label} className="border-l-2 border-primary pl-3"><div className="text-2xl font-bold">{value}</div><div className="text-sm text-muted-foreground">{label}</div></div>)}</div>
      <h3 className="font-semibold">Resumen diario · Madrid</h3>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border">{['Día','Muestras','Con buses','Sin buses','Sin respuesta'].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead><tbody>{data.daily.map(d=><tr key={d.date} className="border-b border-border"><td className="p-2 whitespace-nowrap">{d.date}</td><td className="p-2">{d.samples}</td><td className="p-2">{d.reporting}</td><td className="p-2">{d.empty}</td><td className="p-2">{d.unavailable}</td></tr>)}</tbody></table></div>
      <h3 className="mt-6 font-semibold">Incidentes observados</h3>
      {!data.incidents.length && <p className="mt-2 text-sm text-muted-foreground">Sin incidentes registrados en este período.</p>}
      <div className="mt-2 divide-y divide-border">{data.incidents.map((i,index)=><div key={index} className="py-3 text-sm"><strong>{i.state==='empty'?'Sin buses':'Sin respuesta válida'}{i.samples===1?' · Puntual':''}</strong><p>{date(i.start)} → {i.recovered_at?date(i.recovered_at):'Recuperación no observada'}</p><p className="text-muted-foreground">{i.samples} muestras · Última observación: {date(i.last)}</p></div>)}</div>
    </>}
  </section>;
}