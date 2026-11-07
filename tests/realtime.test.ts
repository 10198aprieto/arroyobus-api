import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

let vp: typeof import('../supabase/functions/gtfs-rt/index');
let tu: typeof import('../supabase/functions/gtfs-rt-trip-updates/index');
beforeAll(async () => {
  Object.assign(globalThis, { Deno: { serve: () => undefined } });
  vp = await import('../supabase/functions/gtfs-rt/index');
  tu = await import('../supabase/functions/gtfs-rt-trip-updates/index');
});
const rows = (name: string): Record<string,string>[] => JSON.parse(readFileSync(`public/gtfs/${name}.json`, 'utf8'));
const seconds = (s: string) => s.split(':').map(Number).reduce((n,v) => n*60+v,0);
const trips = new Map(rows('trips').map(t => [t.trip_id, { tripId:t.trip_id, routeId:t.route_id, serviceId:t.service_id }]));
const stopTimes = new Map<string, {stopId:string; sequence:number; arrival:number; departure:number}[]>();
for (const s of rows('stop_times')) {
  const list = stopTimes.get(s.trip_id) ?? [];
  list.push({stopId:s.stop_id,sequence:Number(s.stop_sequence),arrival:seconds(s.arrival_time),departure:seconds(s.departure_time)});
  stopTimes.set(s.trip_id,list);
}
const g = {
  trips, stopTimes, stopIds: new Set(rows('stops').map(s=>s.stop_id)), routeIds:new Set(rows('routes').map(s=>s.route_id)), stopSequence:new Map<string,number>(),
  services: new Map(rows('calendar').map(c=>[c.service_id,{days:['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d=>Number(c[d])),start:c.start_date,end:c.end_date}])),
  exceptions: new Map(rows('calendar_dates').map(c=>[`${c.service_id}|${c.date}`,Number(c.exception_type)])),
};
const now = Date.parse('2026-11-07T17:20:22Z')/1000;
const current = {tripId:'A42',stopId:'12',route:{routeId:'Azul'},vehicleId:'6355',gpsTimestamp:'2026-11-07T17:20:22Z',arrivalTime:'2026-11-07T17:22:09Z',isEstimated:true,isAproximated:false};
test('current Azul trip wins over future Roja with the same GPS in either input order', () => {
  const future = {...current,tripId:'R46',route:{routeId:'Roja'},arrivalTime:'2026-11-07T20:07:00Z',isEstimated:false};
  for (const module of [vp,tu]) for (const list of [[future,current],[current,future]]) {
    expect(module.selectRealtimeVehicle(list,g,now)?.tripId).toBe('A42');
  }
});
test('a trip id cannot override a conflicting upstream color/route', () => {
  for (const module of [vp,tu]) expect(module.resolveRealtimeArrival(g,{...current,route:{routeId:'Roja'}},now)).toBeNull();
});
test('return to stop 1 resolves to sequence 40, not the first occurrence', () => {
  for (const module of [vp,tu]) expect(module.resolveRealtimeArrival(g,{...current,stopId:'1',arrivalTime:'2026-11-07T18:01:35Z'},now)?.stop.sequence).toBe(40);
});
test('expired and future GPS is not reported as fresh', () => {
  for (const module of [vp,tu]) {
    expect(module.freshRealtimeGps({...current,gpsTimestamp:'2026-11-07T16:16:30Z'},now)).toBe(false);
    expect(module.freshRealtimeGps({...current,gpsTimestamp:'2026-11-07T18:20:22Z'},now)).toBe(false);
    expect(module.freshRealtimeGps(current,now)).toBe(true);
  }
});
test('numeric timestamps are parsed as seconds and milliseconds, not calendar years', () => {
  for (const module of [vp,tu]) {
    expect(module.parseRealtimeTimestamp(String(now))).toBe(now);
    expect(module.parseRealtimeTimestamp(String(now*1000))).toBe(now);
    expect(module.parseRealtimeTimestamp('2026-11-07T18:20:22')).toBeNull();
  }
});
test('calendar service is checked, including removal exceptions', () => {
  for (const module of [vp,tu]) {
    expect(module.realtimeServiceActive(g,'sabados','20261107')).toBe(true);
    expect(module.realtimeServiceActive(g,'laborales','20261107')).toBe(false);
    expect(module.realtimeServiceActive(g,'missing','20261107')).toBe(false);
  }
});
test('both legitimate visits to the same stop survive and backwards departures do not', () => {
  const list = [
    {...current,stopId:'1',staticStopSequence:1,arrivalTime:'2026-11-07T17:00:00Z'},
    {...current,stopId:'1',staticStopSequence:40,arrivalTime:'2026-11-07T18:01:00Z'},
    {...current,staticStopSequence:41,arrivalTime:'2026-11-07T18:02:00Z',departureTime:'2026-11-07T18:00:00Z'},
  ];
  expect(tu.cleanRealtimeUpdates(list).map(a=>a.staticStopSequence)).toEqual([1,40]);
});
test('trip update timestamp preserves source observation instead of refreshing old data', () => {
  expect(tu.predictionTimestamp([{...current,receivedAt:'2026-11-07T17:20:12Z'}],now)).toBe(Date.parse('2026-11-07T17:20:12Z')/1000);
});