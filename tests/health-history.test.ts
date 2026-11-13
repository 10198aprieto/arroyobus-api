import { expect, test } from 'bun:test';
import { vehicleState, summarizeHistory, historyCsv, type Observation } from '../src/lib/health-history';
const row = (minute:number,state:Observation['vehicle_state']):Observation => ({id:String(minute),observed_at:`2026-11-13T18:${String(minute).padStart(2,'0')}:00Z`,source:'scheduled',status:'ok',vehicle_state:state,vehicles:state==='empty'?0:5,trips:2,took_ms:100});
test('zero buses is distinct from an unavailable API',()=>{
  expect(vehicleState({status:'degraded',entities:0})).toBe('empty');
  expect(vehicleState({status:'down'})).toBe('unavailable');
});
test('a single empty sample records a punctual incident with recovery',()=>{
  expect(summarizeHistory([row(0,'reporting'),row(1,'empty'),row(2,'reporting')]).incidents).toEqual([{state:'empty',start:'2026-11-13T18:01:00Z',last:'2026-11-13T18:01:00Z',recovered_at:'2026-11-13T18:02:00Z',samples:1}]);
});
test('missing monitoring intervals are not claimed as continuous outages',()=>{
  const result=summarizeHistory([row(0,'empty'),row(10,'empty')]);
  expect(result.gaps).toBe(1); expect(result.incidents.length).toBe(2);
});
test('CSV preserves a recorded zero vehicle count',()=>{
  expect(historyCsv([row(1,'empty')])).toContain('"0","2","Sin buses"');
});