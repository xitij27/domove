-- Obstacles: only sites whose dates line up with the route's travel days (#5).
--
-- Routes repeat weekly on `weekdays`, run once on `start_date`, or (with
-- neither) run today. Until now `private.match_obstacles()` matched purely
-- spatially, so e.g. a Friday-only site on a Wednesday-only route's path
-- became an obstacle the traveller would never meet. `hits` now also asks
-- `private.site_active_on_route()`: a single trip needs its date inside the
-- site's [starts_on, ends_on], a weekly route needs one upcoming active day
-- on one of its weekdays, and an unscheduled route needs the site active
-- today. NULL dates stay open-ended. Expired sites (ends_on < today) never
-- match a weekly or unscheduled route, so they are pruned on the next pass
-- like spatially-gone sites. Apply after the five-minute schedule migration.
-- The existing cron job calls detect_obstacles(), which calls this matcher.

-- True when a site with [p_starts_on, p_ends_on] is active on at least one of
-- the route's travel days: p_start_date for a single trip, the upcoming
-- p_weekdays for a weekly route, today otherwise.
create or replace function private.site_active_on_route(
  p_weekdays public.weekday[],
  p_start_date date,
  p_starts_on date,
  p_ends_on date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    -- A single trip meets the site when its date falls in the site's window.
    when p_start_date is not null then
      (p_starts_on is null or p_starts_on <= p_start_date)
      and (p_ends_on is null or p_ends_on >= p_start_date)
    -- A weekly route meets the site when an upcoming active day falls on one
    -- of its weekdays. Only the first seven days out of
    -- greatest(starts_on, today) are checked: any longer window holds every
    -- weekday, so the seventh day past the start decides it.
    when coalesce(cardinality(p_weekdays), 0) > 0 then
      (p_ends_on is null or p_ends_on >= current_date)
      and (
        p_ends_on is null
        or exists (
          select 1
          from pg_catalog.generate_series(
            greatest(coalesce(p_starts_on, current_date), current_date),
            least(
              p_ends_on,
              greatest(coalesce(p_starts_on, current_date), current_date) + 6
            ),
            interval '1 day'
          ) d
          where extract(isodow from d)::integer = any (
            select case w
              when 'monday'::public.weekday then 1
              when 'tuesday'::public.weekday then 2
              when 'wednesday'::public.weekday then 3
              when 'thursday'::public.weekday then 4
              when 'friday'::public.weekday then 5
              when 'saturday'::public.weekday then 6
              else 7
            end
            from pg_catalog.unnest(p_weekdays) as w
          )
        )
      )
    -- No schedule means today: the site must be active now.
    else
      (p_starts_on is null or p_starts_on <= current_date)
      and (p_ends_on is null or p_ends_on >= current_date)
  end
$$;

-- Same as in 20261016181000_obstacles.sql, plus the travel-day check in
-- `hits`. Spatially-gone and temporally-gone rows are pruned the same way,
-- so routes whose stored path is outdated keep their obstacles either way.
create or replace function private.match_obstacles()
returns integer
language sql
set search_path = ''
as $$
  with paths as (
    select l.route_id, l.line
    from private.route_lines l
    join private.route_requests q on q.route_id = l.route_id and q.url = l.request
  ), hits as (
    select p.route_id, s.id as site_id,
      extensions.st_distance(p.line, coalesce(s.geom, s.location)) as distance_meters
    from paths p
    join public.routes r on r.id = p.route_id
    join public.construction_sites s
      on extensions.st_dwithin(p.line, coalesce(s.geom, s.location), case when s.geom is null then 55 else 30 end)
     and private.site_active_on_route(r.weekdays, r.start_date, s.starts_on, s.ends_on)
  ), saved as (
    insert into public.obstacles (route_id, construction_site_id, distance_meters)
    select route_id, site_id, distance_meters from hits
    on conflict (route_id, construction_site_id) do update
      set distance_meters = excluded.distance_meters, detected_at = now()
    returning 1
  ), gone as (
    delete from public.obstacles o
    using paths p
    where o.route_id = p.route_id
      and not exists (select 1 from hits h where h.route_id = o.route_id and h.site_id = o.construction_site_id)
  )
  select count(*)::integer from saved;
$$;

revoke all on function private.site_active_on_route(public.weekday[], date, date, date) from public, anon, authenticated;
revoke all on function private.match_obstacles() from public, anon, authenticated;
