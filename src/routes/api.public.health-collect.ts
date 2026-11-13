import { createFileRoute } from '@tanstack/react-router';
import { vehicleState } from '@/lib/health-history';
export const Route=createFileRoute('/api/public/health-collect')({server:{handlers:{POST:async({request})=>{
  const {authenticateCronRequest}=await import('@/integrations/supabase/cron-auth');
  const denied=await authenticateCronRequest(request);if(denied)return denied;
  // Do not let user-supplied headers or bodies choose the monitored origin.
  const result=await fetch('https://arroyobus-api.lovable.app/api/public/health',{signal:AbortSignal.timeout(55000)});
  if(!result.ok)return Response.json({error:'Health unavailable'},{status:502});
  const health=await result.json() as {status:string;generated_at:string;took_ms:number;checks:{id:string;status:string;entities?:number}[]};
  if(!Array.isArray(health.checks) || !['ok','degraded','down'].includes(health.status))return Response.json({error:'Invalid health response'},{status:502});
  const vehicle=health.checks.find(c=>c.id==='gtfs-rt-vehicle-positions');
  const trip=health.checks.find(c=>c.id==='gtfs-rt-trip-updates');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {error}=await supabaseAdmin.from('health_observations').insert({observed_at:new Date().toISOString(),source:'scheduled',status:health.status,vehicle_state:vehicleState(vehicle),vehicles:vehicle?.entities ?? null,trips:trip?.entities ?? null,took_ms:health.took_ms,checks:health.checks});
  if(error && error.code!=='23505')return Response.json({error:'Could not store health observation'},{status:500});
  return Response.json({saved:!error,vehicle_state:vehicleState(vehicle),vehicles:vehicle?.entities ?? null});
}}}});