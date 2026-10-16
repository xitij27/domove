// REST smoke test against a local Supabase stack only; never point it at the team project.
// Start the stack as described in docs/routes.md, then:
//   SUPABASE_PUBLISHABLE_KEY=<key from `supabase status`> node backend/supabase/tests/routes-rest.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost)[:/]/, 'Only run this against a local Supabase stack.');
assert.ok(key, 'Set SUPABASE_PUBLISHABLE_KEY to the local publishable key.');

const headers = { apikey: key, 'Content-Type': 'application/json' };
const created = [];
async function request(path, method = 'GET', body) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await (!response.ok ? response.text() : '')}`);
  return response.status === 204 ? undefined : response.json();
}

try {
  for (const mode of ['pedestrian', 'bike', 'car']) {
    const id = randomUUID();
    const route = await request('rpc/create_saved_route', 'POST', {
      p_id: id, p_start_label: '  REST Station ', p_finish_label: 'REST Park', p_modality: mode,
      p_waypoints: [' Cafe ', '', 'Library'],
    });
    created.push(id);
    assert.equal(route.id, id);
    assert.equal(route.start.label, 'REST Station');
    assert.equal(route.mode, mode);
    assert.equal(route.start.coordinate, null);
    assert.ok(route.createdAt);
    assert.deepEqual(route.waypoints.map((stop) => [stop.label, stop.sequence]), [['Cafe', 0], ['Library', 1]]);
  }

  // Retrying with the same ID, as the app does after a lost response, returns the saved route.
  const retried = await request('rpc/create_saved_route', 'POST', {
    p_id: created[0], p_start_label: 'REST Station', p_finish_label: 'REST Park', p_modality: 'pedestrian',
    p_waypoints: ['Cafe', 'Library'],
  });
  assert.equal(retried.id, created[0]);
  assert.equal((await request(`route_waypoints?route_id=eq.${created[0]}`)).length, 2);

  // A separate read request reloads persisted state, as a reopened app does.
  const rows = await request('saved_routes?select=route&order=created_at.desc,id.desc&limit=100');
  for (const id of created) assert.equal(rows.filter(({ route }) => route.id === id).length, 1);

  // The next page after a route, with the cursor mobile/src/routes/api.ts sends.
  const { createdAt, id: newest } = rows.find(({ route }) => route.id === created[2]).route;
  const cursor = `(created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${newest}))`;
  const after = await request(`saved_routes?select=route&order=created_at.desc,id.desc&limit=100&or=${encodeURIComponent(cursor)}`);
  assert.ok(!after.some(({ route }) => route.id === newest));
  for (const id of created.slice(0, 2)) assert.ok(after.some(({ route }) => route.id === id));

  // Validation errors carry the message the app shows.
  const invalid = await fetch(`${url}/rest/v1/rpc/create_saved_route`, {
    method: 'POST', headers,
    body: JSON.stringify({ p_id: randomUUID(), p_start_label: '', p_finish_label: 'Park', p_modality: 'car' }),
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(
    (({ code, message }) => ({ code, message }))(await invalid.json()),
    { code: '22023', message: 'Starting location must contain 1 to 200 characters.' },
  );

  const [deleted, retained] = created;
  await request(`routes?id=eq.${deleted}`, 'DELETE');
  assert.deepEqual(await request(`saved_routes?id=eq.${deleted}`), []);
  assert.deepEqual(await request(`route_waypoints?route_id=eq.${deleted}`), []);
  assert.equal((await request(`saved_routes?id=eq.${retained}`)).length, 1);
  console.log('PASS: REST creation, three modes, ordered stops, idempotent retry, reload, keyset paging, validation, deletion and waypoint cascade.');
} finally {
  for (const id of created) await request(`routes?id=eq.${id}`, 'DELETE');
}
