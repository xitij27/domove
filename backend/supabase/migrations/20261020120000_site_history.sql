-- Keeps what the city's feed forgets. The feed drops a work once it ends, and a site's id is a hash of its status,
-- title, dates and point, so moving its dates or starting it replaces the row. Each version stays here with the first
-- and last hourly sync that saw it: which works ran on a past day, and how often published dates move, come from this
-- table alone. One row per version, not per day, so it grows only as the feed changes.
create table public.construction_site_history (
  id text primary key, -- construction_sites.id of this version
  status text not null check (status in ('current', 'planned')),
  title text not null,
  owner text,
  district text,
  starts_on date,
  ends_on date,
  latitude double precision not null,
  longitude double precision not null,
  geom extensions.geography(multipolygon, 4326),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null
);
create index construction_site_history_seen_idx on public.construction_site_history (first_seen_at, last_seen_at);

-- the city's open data, like construction_sites: anyone reads, only the job below writes
alter table public.construction_site_history enable row level security;
create policy "Anyone can read the site history" on public.construction_site_history
  for select to anon, authenticated using (true);
grant select on public.construction_site_history to anon, authenticated;

-- `at` is the sync it records; tests pass their own, the job takes now()
create or replace function private.record_site_history(at timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  seen integer;
begin
  insert into public.construction_site_history as h
    (id, status, title, owner, district, starts_on, ends_on, latitude, longitude, geom, first_seen_at, last_seen_at)
  select id, status, title, owner, district, starts_on, ends_on, latitude, longitude, geom, at, at
  from public.construction_sites
  -- owner and district can change without changing the id; the polygon can arrive after the point
  on conflict (id) do update set
    owner = excluded.owner,
    district = excluded.district,
    geom = coalesce(excluded.geom, h.geom),
    -- a late or repeated run only ever widens a version's span
    first_seen_at = least(h.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(h.last_seen_at, excluded.last_seen_at);
  get diagnostics seen = row_count;
  return seen;
end;
$$;
revoke all on function private.record_site_history(timestamptz) from public, anon, authenticated;

-- ten minutes after each hourly sync, and once now so the history starts with today's feed
select cron.schedule('record-site-history', '10 * * * *', 'select private.record_site_history()');
select private.record_site_history();
