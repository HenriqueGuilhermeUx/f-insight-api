begin;

create table if not exists public.market_news (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_id text not null,
  category text,
  title text not null,
  summary text,
  source text,
  url text,
  image_url text,
  published_at timestamptz,
  tags jsonb not null default '[]'::jsonb,
  sentiment text,
  raw jsonb,
  created_at timestamptz not null default now(),
  constraint market_news_provider_id_unique unique (provider, provider_id)
);

create index if not exists idx_market_news_published_at
  on public.market_news (published_at desc);

alter table public.market_news enable row level security;

create table if not exists public.market_indicator_snapshots (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  provider text not null,
  last_price numeric,
  change numeric,
  change_percent numeric,
  avg_volume numeric,
  candles jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint market_indicator_symbol_provider_unique unique (symbol, provider)
);

create index if not exists idx_market_indicator_fetched_at
  on public.market_indicator_snapshots (fetched_at desc);

alter table public.market_indicator_snapshots enable row level security;

create table if not exists public.market_macro_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_market_macro_fetched_at
  on public.market_macro_snapshots (fetched_at desc);

alter table public.market_macro_snapshots enable row level security;

create table if not exists public.market_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  ran_at timestamptz not null default now()
);

create index if not exists idx_market_refresh_runs_ran_at
  on public.market_refresh_runs (ran_at desc);

alter table public.market_refresh_runs enable row level security;

comment on table public.market_news is
  'F-Insight market/news cache; backend service-role access only.';

comment on table public.market_indicator_snapshots is
  'F-Insight market indicator cache; backend service-role access only.';

comment on table public.market_macro_snapshots is
  'F-Insight macro cache; backend service-role access only.';

comment on table public.market_refresh_runs is
  'F-Insight refresh telemetry; backend service-role access only.';

commit;
