-- Site areas: the hourly sync reads the city's area feeds and stores each site's
-- polygon, so the pg_cron job stays the only writer of construction_sites
-- (docs/route-planning-open-questions.md, question 3). The area feeds list the
-- same sites with the same fields as the point feeds, so site ids don't change.
--
-- The live database already has geom and area_sqm from #5's former Node sync,
-- so every statement is also safe to run there. No network calls: the next
-- hourly run fills the polygons.

alter table public.construction_sites
  add column if not exists geom extensions.geography(multipolygon, 4326);
create index if not exists construction_sites_geom_idx
  on public.construction_sites using gist (geom);

-- Generated, so the area can't drift from the polygon (live had a plain column).
alter table public.construction_sites drop column if exists area_sqm;
alter table public.construction_sites
  add column area_sqm double precision generated always as (extensions.st_area(geom)) stored;

-- A malformed shape gets no polygon instead of failing the whole sync; such a
-- site is matched by its centre point.
create or replace function private.geography_from_geojson(shape jsonb)
returns extensions.geography
language plpgsql
immutable
strict
set search_path = ''
as $$
begin
  return extensions.st_multi(extensions.st_geomfromgeojson(shape))::extensions.geography(multipolygon, 4326);
exception when others then
  return null;
end;
$$;

revoke all on function private.geography_from_geojson(jsonb) from public, anon, authenticated;

create or replace function private.sync_construction_sites()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  feed record;
  res record;
  body jsonb;
  items jsonb := '[]';
  fresh text[] := '{}';
  total integer;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '30000');

  for feed in
    select * from (values
      ('current', 'fb66-baustellen-tagesaktuell-flachen'),
      ('planned', 'fb66-baustellen-geplant-flachen')
    ) as f(status, dataset)
  loop
    select r.status, r.content into res
    from extensions.http_get('https://open-data.dortmund.de/api/explore/v2.1/catalog/datasets/' || feed.dataset || '/exports/json') r;
    if res.status <> 200 then
      raise exception '%: HTTP %', feed.dataset, res.status;
    end if;

    body := res.content::jsonb;
    if jsonb_typeof(body) <> 'array' then
      raise exception '%: expected a JSON array', feed.dataset;
    end if;
    -- an empty feed keeps its old rows instead of wiping them
    if jsonb_array_length(body) > 0 then
      fresh := fresh || feed.status;
    end if;

    items := items || (
      select coalesce(jsonb_agg(i || jsonb_build_object('_status', feed.status)), '[]')
      from jsonb_array_elements(body) i
    );
  end loop;

  insert into public.construction_sites
    (id, status, title, owner, period, district, starts_on, ends_on, latitude, longitude, geom, last_seen_at)
  select distinct on (id) * from (
    select
      md5(concat_ws('|', i->>'_status', i->>'art_der_baumassnahme', i->>'von', i->>'bis', p->>'lat', p->>'lon')) as id,
      i->>'_status' as status,
      coalesce(i->>'art_der_baumassnahme', 'Baustelle') as title,
      i->>'auftraggeber' as owner,
      i->>'zeitraum' as period,
      -- the planned area feed names the district field differently
      coalesce(i->>'stadtbezirk', i->>'stadtbezirk_bezeichnung') as district,
      case when i->>'von' ~ '^\d{4}-\d{2}-\d{2}$' then (i->>'von')::date end as starts_on,
      case when i->>'bis' ~ '^\d{4}-\d{2}-\d{2}$' then (i->>'bis')::date end as ends_on,
      (p->>'lat')::double precision as latitude,
      (p->>'lon')::double precision as longitude,
      private.geography_from_geojson(i->'geo_shape'->'geometry') as geom,
      now() as last_seen_at
    from jsonb_array_elements(items) i
    -- the two feeds name the point field differently
    cross join lateral (select coalesce(nullif(i->'geografische_koordinate', 'null'), i->'geo_point_2d') as p) g
    where jsonb_typeof(p->'lat') = 'number' and jsonb_typeof(p->'lon') = 'number'
      and (p->>'lat')::double precision between -90 and 90
      and (p->>'lon')::double precision between -180 and 180
  ) x
  on conflict (id) do update set
    owner = excluded.owner,
    period = excluded.period,
    district = excluded.district,
    geom = excluded.geom,
    last_seen_at = excluded.last_seen_at;

  -- now() is fixed per transaction, so anything not touched above has left the feed
  delete from public.construction_sites where status = any(fresh) and last_seen_at < now();

  select count(*) into total from public.construction_sites;
  return total;
end;
$$;
