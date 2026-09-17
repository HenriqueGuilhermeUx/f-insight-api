begin;

create table if not exists public.finsight_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ticker text not null,
  name text not null,
  type text not null default 'stock',
  created_at timestamptz not null default now(),
  constraint finsight_watchlist_user_ticker_unique unique (user_id, ticker)
);

create index if not exists idx_finsight_watchlist_user_created
  on public.finsight_watchlist_items (user_id, created_at);

alter table public.finsight_watchlist_items enable row level security;

create table if not exists public.finsight_price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ticker text not null,
  type text not null,
  value numeric not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  triggered_at timestamptz null
);

create index if not exists idx_finsight_alerts_user_created
  on public.finsight_price_alerts (user_id, created_at desc);

create index if not exists idx_finsight_alerts_active_ticker
  on public.finsight_price_alerts (ticker, enabled)
  where enabled = true;

alter table public.finsight_price_alerts enable row level security;

-- Intentionally no anon/authenticated policies here.
-- The F-Insight backend uses the Supabase service-role credential and remains
-- the only supported access path for these tables until user JWT ownership
-- is wired end-to-end.

comment on table public.finsight_watchlist_items is
  'Persistent F-Insight user watchlist; backend service-role access only.';

comment on table public.finsight_price_alerts is
  'Persistent F-Insight user price/market alerts; backend service-role access only.';

commit;
