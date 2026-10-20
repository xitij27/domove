-- No HTTP calls: seed construction_sites by hand, record two syncs, and check what the history keeps.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

delete from public.construction_sites;
delete from public.construction_site_history;

-- first sync: two works
insert into public.construction_sites (id, status, title, owner, district, starts_on, ends_on, latitude, longitude)
values
  ('a-v1', 'planned', 'Musterstraße // Vollsperrung', 'Tiefbauamt', 'Hörde', '2026-11-02', '2026-11-20', 51.49, 7.50),
  ('b', 'current', 'Beispielweg // halbseitige Sperrung', 'DEW21', 'Eving', '2026-10-01', '2026-12-01', 51.55, 7.47);
select is(private.record_site_history('2026-10-20 10:10+02'), 2, 'the first sync records both works');
select is((select count(*)::integer from public.construction_site_history), 2, 'one row per version');

-- second sync: the city moves a's dates (new id) and b changes owner
update public.construction_sites set owner = 'Stadtwerke' where id = 'b';
delete from public.construction_sites where id = 'a-v1';
insert into public.construction_sites (id, status, title, owner, district, starts_on, ends_on, latitude, longitude)
values ('a-v2', 'planned', 'Musterstraße // Vollsperrung', 'Tiefbauamt', 'Hörde', '2026-12-07', '2026-12-23', 51.49, 7.50);
select is(private.record_site_history('2026-10-20 11:10+02'), 2, 'the second sync records the two works in the feed');

select is((select count(*)::integer from public.construction_site_history), 3, 'the moved work keeps its old version and gains a new one');
select is((select last_seen_at from public.construction_site_history where id = 'a-v1'), '2026-10-20 10:10+02'::timestamptz,
  'the old version stops at the last sync that saw it');
select is((select first_seen_at from public.construction_site_history where id = 'a-v2'), '2026-10-20 11:10+02'::timestamptz,
  'the new version starts at the sync that first saw it');
select is((select array[first_seen_at, last_seen_at] from public.construction_site_history where id = 'b'),
  array['2026-10-20 10:10+02', '2026-10-20 11:10+02']::timestamptz[], 'an unchanged work spans both syncs');
select is((select owner from public.construction_site_history where id = 'b'), 'Stadtwerke', 'an owner change updates the row in place');

-- a late run only widens a version's span: earlier start, same end
select private.record_site_history('2026-10-20 09:00+02');
select is((select array[first_seen_at, last_seen_at] from public.construction_site_history where id = 'b'),
  array['2026-10-20 09:00+02', '2026-10-20 11:10+02']::timestamptz[], 'an older run does not shorten a version');

-- the history is the city's open data: readable with the publishable key, never writable with it
set local role anon;
select is((select count(*)::integer from public.construction_site_history), 3, 'anon can read the history');
select throws_ok($$insert into public.construction_site_history (id, status, title, latitude, longitude, first_seen_at, last_seen_at)
  values ('x', 'current', 'x', 0, 0, now(), now())$$, '42501', null, 'anon cannot write the history');
select throws_ok($$select private.record_site_history()$$, '42501', null, 'anon cannot run the recorder');
reset role;

select * from finish();
rollback;
