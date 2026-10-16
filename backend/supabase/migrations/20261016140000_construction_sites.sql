-- Construction sites from the Dortmund open data portal, synced hourly inside Postgres.

create extension if not exists postgis with schema extensions;
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table public.construction_sites (
  id text primary key, -- md5 of the source fields; the feeds have no stable id
  status text not null check (status in ('current', 'planned')),
  title text not null,
  owner text,
  period text,
  district text,
  starts_on date,
  ends_on date,
  latitude double precision not null,
  longitude double precision not null,
  location extensions.geography(point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  last_seen_at timestamptz not null default now()
);

create index construction_sites_location_idx on public.construction_sites using gist (location);

alter table public.construction_sites enable row level security;
create policy "Anyone can read construction sites" on public.construction_sites
  for select to anon, authenticated using (true);
grant select on public.construction_sites to anon, authenticated;

create schema if not exists private;

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
      ('current', 'fb66-baustellen-tagesaktuell'),
      ('planned', 'fb66-baustellen-geplant')
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
    (id, status, title, owner, period, district, starts_on, ends_on, latitude, longitude, last_seen_at)
  select distinct on (id) * from (
    select
      md5(concat_ws('|', i->>'_status', i->>'art_der_baumassnahme', i->>'von', i->>'bis', p->>'lat', p->>'lon')) as id,
      i->>'_status' as status,
      coalesce(i->>'art_der_baumassnahme', 'Baustelle') as title,
      i->>'auftraggeber' as owner,
      i->>'zeitraum' as period,
      i->>'stadtbezirk' as district,
      case when i->>'von' ~ '^\d{4}-\d{2}-\d{2}$' then (i->>'von')::date end as starts_on,
      case when i->>'bis' ~ '^\d{4}-\d{2}-\d{2}$' then (i->>'bis')::date end as ends_on,
      (p->>'lat')::double precision as latitude,
      (p->>'lon')::double precision as longitude,
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
    last_seen_at = excluded.last_seen_at;

  -- now() is fixed per transaction, so anything not touched above has left the feed
  delete from public.construction_sites where status = any(fresh) and last_seen_at < now();

  select count(*) into total from public.construction_sites;
  return total;
end;
$$;

revoke all on function private.sync_construction_sites() from public, anon, authenticated;

select cron.schedule('sync-construction-sites', '0 * * * *', 'select private.sync_construction_sites()');

select private.sync_construction_sites();
