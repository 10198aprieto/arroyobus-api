import { createFileRoute } from '@tanstack/react-router';
import { vehicleState } from '@/lib/health-history';
export const Route=createFileRoute('/api/public/health-collect')({server:{handlers:{POST:async({request})=>{
  const {authenticateCronRequest}=await import('@/integrations/supabase/cron-auth');
  const denied=await authenticateCronRequest(request);if(denied)return denied;
  // Do not let user-supplied headers or bodies choose the monitored origin.
  const started=Date.now();
  type Snapshot={status:string;generated_at:string;took_ms:number;checks:{id:string;status:string;entities?:number}[]};
  let health:Snapshot;
  try {
    const result=await fetch('https://arroyobus-api.lovable.app/api/public/health',{signal:AbortSignal.timeout(55000)});
    if(!result.ok)throw new Error('Health unavailable');
    const body=await result.json() as Snapshot;
    if(!Array.isArray(body.checks) || !['ok','degraded','down'].includes(body.status))throw new Error('Invalid health response');
    health=body;
  } catch {
    // A failed health request is itself an observation, not a missing record.
    health={status:'down',generated_at:new Date().toISOString(),took_ms:Date.now()-started,checks:[{id:'gtfs-rt-vehicle-positions',status:'down'},{id:'gtfs-rt-trip-updates',status:'down'}]};
  }
  const vehicle=health.checks.find(c=>c.id==='gtfs-rt-vehicle-positions');
  const trip=health.checks.find(c=>c.id==='gtfs-rt-trip-updates');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {error}=await supabaseAdmin.from('health_observations').insert({observed_at:new Date().toISOString(),source:'scheduled',status:health.status,vehicle_state:vehicleState(vehicle),vehicles:vehicle?.entities ?? null,trips:trip?.entities ?? null,took_ms:health.took_ms,checks:health.checks});
  if(error && error.code!=='23505')return Response.json({error:'Could not store health observation'},{status:500});
  return Response.json({saved:!error,vehicle_state:vehicleState(vehicle),vehicles:vehicle?.entities ?? null});
}}}});