-- No HTTP calls: seed a current path, then exercise the cron entry point.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Anchor all fixtures to a future Monday so this suite never expires.
create temporary table calendar as
select current_date + (8 - extract(isodow from current_date)::integer) as monday;

select ok(private.site_active_on_route('{monday}', null, monday, monday), 'inclusive Monday match') from calendar;
select ok(not private.site_active_on_route('{wednesday}', null, monday, monday + 1), 'Monday-Tuesday work does not affect Wednesday') from calendar;
select ok(private.site_active_on_route('{wednesday}', null, monday, monday + 2), 'inclusive end date matches Wednesday') from calendar;
select ok(private.site_active_on_route('{sunday}', null, monday, monday + 6), 'a full week includes Sunday') from calendar;
select ok(private.site_active_on_route('{friday,monday}', null, monday, monday), 'any selected weekday may match') from calendar;
select ok(not private.site_active_on_route('{monday}', null, current_date - 14, current_date - 1), 'expired work is ignored');
select ok(not private.site_active_on_route('{monday}', null, monday + 3, monday), 'reversed date range does not match') from calendar;
select ok(private.site_active_on_route('{monday}', null, monday, null), 'missing end date is open-ended') from calendar;
select ok(private.site_active_on_route('{monday}', null, null, monday), 'missing start date is open-ended') from calendar;
select ok(private.site_active_on_route('{monday}', null, null, null), 'unknown site dates remain eligible');
select ok(private.site_active_on_route('{}', monday, monday, monday), 'single trip matches inclusive boundaries') from calendar;
select ok(not private.site_active_on_route('{}', monday, monday + 1, null), 'single trip before work is excluded') from calendar;
select ok(not private.site_active_on_route('{}', monday, null, monday - 1), 'single trip after work is excluded') from calendar;
select ok(private.site_active_on_route('{}', null, current_date, current_date), 'unscheduled route uses today');
select ok(not private.site_active_on_route('{}', null, current_date + 1, null), 'unscheduled route excludes future work');
select ok(not private.site_active_on_route('{}', null, null, current_date - 1), 'unscheduled route excludes expired work');

delete from public.routes;
delete from public.construction_sites;
insert into public.routes (id, start_location, finish_location, start_time, weekdays, modality)
values ('00000000-0000-4000-8000-000000000001', 'SRID=4326;POINT(7.46 51.51)', 'SRID=4326;POINT(7.47 51.51)', '08:00', '{monday}', 'pedestrian');
insert into private.route_lines (route_id, request, line)
select route_id, url, 'SRID=4326;LINESTRING(7.46 51.51,7.47 51.51)'::extensions.geography from private.route_requests;
insert into public.construction_sites (id, status, title, latitude, longitude, starts_on, ends_on)
select 'monday-work', 'planned', 'Monday work', 51.51, 7.465, monday, monday from calendar
union all
select 'wednesday-work', 'planned', 'Wednesday work', 51.51, 7.465, monday + 2, monday + 2 from calendar;

select is(private.detect_obstacles(), 1, 'cron entry point generates only the overlapping site');
select is((select array_agg(construction_site_id order by construction_site_id) from public.obstacles), '{monday-work}'::text[], 'nearby work on another weekday is excluded');
update public.routes set weekdays = '{wednesday}';
select is(private.detect_obstacles(), 1, 'schedule-only edit works with the cached route path');
select is((select array_agg(construction_site_id order by construction_site_id) from public.obstacles), '{wednesday-work}'::text[], 'old weekday match is pruned and new match inserted');
update public.construction_sites set starts_on = current_date - 2, ends_on = current_date - 1;
select is(private.detect_obstacles(), 0, 'expired sites no longer match');
select is((select count(*)::integer from public.obstacles), 0, 'expired obstacles are removed');

select is((select schedule from cron.job where jobname = 'detect-obstacles'), '1-59/5 * * * *', 'five-minute schedule remains wired');
select is((select command from cron.job where jobname = 'detect-obstacles'), 'select private.detect_obstacles()', 'cron still calls the tested entry point');
select ok(not has_function_privilege('anon', 'private.site_active_on_route(public.weekday[],date,date,date)', 'EXECUTE'), 'anonymous callers cannot execute the private helper');
select * from finish();
rollback;
