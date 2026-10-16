// Disposable local PostgREST only; no production keys or external services.
// Start it as described in docs/routes.md, then: node supabase/tests/routes-rest.mjs
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3081';
const created = [];
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await (!response.ok ? response.text() : '')}`);
  return response.status === 204 ? undefined : response.json();
}

try {
  for (const mode of ['pedestrian', 'bike', 'car']) {
    const route = await request('rpc/create_saved_route', 'POST', {
      p_start_label: '  REST Station ', p_finish_label: 'REST Park', p_modality: mode,
      p_waypoints: [' Cafe ', '', 'Library'],
    });
    created.push(route.id);
    assert.equal(route.start.label, 'REST Station');
    assert.equal(route.mode, mode);
    assert.equal(route.start.coordinate, null);
    assert.ok(route.createdAt);
    assert.deepEqual(route.waypoints.map((stop) => [stop.label, stop.sequence]), [['Cafe', 0], ['Library', 1]]);
  }

  // A separate read request reloads persisted state, as a reopened app does.
  const rows = await request('saved_routes?select=route&order=created_at.desc,id.desc&limit=100&offset=0');
  for (const id of created) assert.ok(rows.some(({ route }) => route.id === id));
  const invalid = await fetch(`${base}/rpc/create_saved_route`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_start_label: '', p_finish_label: 'Park', p_modality: 'car' }),
  });
  assert.equal(invalid.status, 400);

  const [deleted, retained] = created;
  await request(`routes?id=eq.${deleted}`, 'DELETE');
  assert.deepEqual(await request(`saved_routes?id=eq.${deleted}`), []);
  assert.deepEqual(await request(`route_waypoints?route_id=eq.${deleted}`), []);
  assert.equal((await request(`saved_routes?id=eq.${retained}`)).length, 1);
  console.log('PASS: REST creation, three modes, ordered stops, reload, validation, deletion and waypoint cascade.');
} finally {
  for (const id of created) await request(`routes?id=eq.${id}`, 'DELETE');
}
