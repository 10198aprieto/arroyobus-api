import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { exportRows, historyCsv, summarizeHistory, type Observation } from './health-history';
const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Cache-Control':'no-store' };
export async function readHistoryResponse(request: Request) {
  const url = new URL(request.url);
  const parsed = z.object({from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),format:z.enum(['json','csv','xlsx']).default('json')}).safeParse(Object.fromEntries(['from','to','format'].flatMap(key => url.searchParams.has(key)?[[key,url.searchParams.get(key)]]:[])));
  if (!parsed.success) return Response.json({error:'Filtros inválidos'}, {status:400,headers:cors});
  const {from,to,format} = parsed.data;
  if ((from && !Number.isFinite(Date.parse(from))) || (to && !Number.isFinite(Date.parse(to))) || (from && to && from>to)) return Response.json({error:'Fechas inválidas'}, {status:400,headers:cors});
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  const base = process.env.SUPABASE_URL;
  if (!key || !base) return Response.json({error:'Histórico no disponible'}, {status:503,headers:cors});
  const sb = createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{const h=new Headers(init?.headers);if(key.startsWith('sb_'))h.delete('Authorization');h.set('apikey',key);return fetch(input,{...init,headers:h});}}});
  const columns='id,observed_at,source,status,vehicle_state,vehicles,trips,took_ms';
  const first = await sb.from('health_observations').select('observed_at').order('observed_at',{ascending:true}).limit(1);
  const rows:Observation[]=[];
  // Keyset pagination avoids silently truncating long exports at the API row cap.
  let cursor:string|undefined;
  for (;;) {
    let query=sb.from('health_observations').select(columns).order('observed_at',{ascending:true}).order('id',{ascending:true}).limit(1000);
    if(from)query=query.gte('observed_at',from+'T00:00:00Z');
    if(to)query=query.lt('observed_at',new Date(Date.parse(to)+86400000).toISOString());
    if(cursor)query=query.gt('observed_at',cursor);
    const result=await query;
    if(result.error)return Response.json({error:'No se pudo leer el histórico'}, {status:503,headers:cors});
    const batch=(result.data ?? []) as Observation[];rows.push(...batch);
    if(batch.length<1000)break;
    cursor=batch[batch.length-1]?.observed_at;
    if(!cursor)break;
  }
  const summary=summarizeHistory(rows);
  if(format==='csv')return new Response(historyCsv(rows),{headers:{...cors,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="arroyobus-health.csv"'}});
  if(format==='xlsx'){
    const XLSX=await import('xlsx');
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(exportRows(rows)),'Observaciones');
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(summary.daily),'Resumen diario');
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(summary.incidents),'Incidentes');
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{Inicio_registro:first.data?.[0]?.observed_at ?? '',Cadencia_segundos:60,Datos_previos:'No disponibles; no se reconstruyen sin una fuente verificable',Huecos:summary.gaps,Fechas_filtro:'UTC',Resumen_diario:'Europe/Madrid'}]),'Cobertura');
    return new Response(XLSX.write(workbook,{type:'array',bookType:'xlsx'}),{headers:{...cors,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="arroyobus-health.xlsx"'}});
  }
  return Response.json({monitoring_started_at:first.data?.[0]?.observed_at ?? null,interval_seconds:60,previous_history_available:false,rows,...summary},{headers:cors});
}