-- Issue #4 preparation only. This migration does not enable push delivery.
-- No client can read or write these tables. A future authenticated server must
-- verify routes.owner_id = auth.uid() before using route_id on any request.
create schema if not exists notification_private;
revoke all on schema notification_private from public, anon, authenticated;
grant usage on schema notification_private to service_role;

create table notification_private.route_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  preference text not null default 'DISABLED' check (preference in ('ONE_WEEK_BEFORE', 'ONE_DAY_BEFORE', 'DISABLED')),
  notification_time time without time zone not null default '09:00',
  commute_days public.weekday[],
  departure_time time without time zone,
  important_updates boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, route_id),
  constraint commute_days_nonempty check (commute_days is null or cardinality(commute_days) between 1 and 7)
);

create table notification_private.push_devices (
  token text primary key check (length(token) between 20 and 512),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  active boolean not null default true,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_devices_user_id_idx on notification_private.push_devices (user_id);

-- The unique key is the persistent idempotency boundary for a future sender.
-- Status must be reconciled with Expo tickets/receipts before retrying failures.
create table notification_private.delivery_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  obstacle_id text not null,
  revision text not null,
  kind text not null check (kind in ('REMINDER', 'IMPORTANT_UPDATE')),
  scheduled_for timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'CANCELLED')),
  expo_ticket_id text,
  error_code text,
  updated_at timestamptz not null default now(),
  unique (user_id, route_id, obstacle_id, revision, kind)
);
create index delivery_attempts_pending_idx on notification_private.delivery_attempts (scheduled_for)
  where status = 'PENDING';

alter table notification_private.route_settings enable row level security;
alter table notification_private.push_devices enable row level security;
alter table notification_private.delivery_attempts enable row level security;
revoke all on all tables in schema notification_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema notification_private to service_role;

-- Intentionally no anon/authenticated policies or RPCs. Existing public.routes
-- has no owner_id and currently permits anonymous access, so route ownership
-- cannot be verified safely yet. Do not expose these tables via PostgREST.
