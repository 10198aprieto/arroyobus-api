import { beforeAll, afterAll, expect, test } from 'bun:test';
import gtfs from '../src/lib/laguna-gtfs.json';

let alerts: typeof import('../supabase/functions/gtfs-rt-alerts/index');
const originalFetch = globalThis.fetch;
const calls: string[] = [];
beforeAll(async () => {
  Object.assign(globalThis, { Deno: { serve: () => undefined, env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://backend.invalid' : 'test-key' } } });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const feed = new URL(String(input)).searchParams.get('feed');
    calls.push(feed ?? '');
    return Response.json([{ id: feed, header: 'Test', description: '', cause: 3, effect: 4, route_ids: ['L01'], stop_ids: ['13'], start_at: '2026-01-01T00:00:00Z', end_at: null }]);
  }) as typeof fetch;
  alerts = await import('../supabase/functions/gtfs-rt-alerts/index');
});
afterAll(() => { globalThis.fetch = originalFetch; });

test('Laguna and RíoBUS queries and cached alerts remain isolated', async () => {
  expect((await alerts.fetchOwnAlerts('laguna'))[0].alertId).toBe('eq.laguna');
  expect((await alerts.fetchOwnAlerts('riobus'))[0].alertId).toBe('eq.riobus');
  expect((await alerts.fetchOwnAlerts('laguna'))[0].alertId).toBe('eq.laguna');
  expect(calls).toEqual(['eq.laguna', 'eq.riobus']);
});
test('Laguna selectors match the supplied L01 route and Plaza de las Comunidades stop', () => {
  const reference = { agencyId: 'ECSA', routeIds: new Set(gtfs.routes.map(r => r.route_id)), stopIds: new Set(gtfs.stops.map(s => s.stop_id)) };
  expect(alerts.selectorsFor({ alertId: 'test', routes: ['L01', 'Roja'], stops: ['13', '999'] }, reference)).toEqual([{ routeId: 'L01' }, { stopId: '13' }]);
});
test('Agency-wide Laguna protobuf uses ECSA and preserves published cause and effect', () => {
  const reference = { agencyId: 'ECSA', routeIds: new Set<string>(), stopIds: new Set<string>() };
  const pb = alerts.encFeedMessage([{ alertId: 'test', cause: 3, effect: 4 }], 1, reference);
  expect(new TextDecoder().decode(pb)).toContain('ECSA');
  expect(Array.from(pb)).toContain(48);
  expect(Array.from(pb).join(',')).toContain('48,3,56,4');
});