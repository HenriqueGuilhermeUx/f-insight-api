begin;

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id text,
  plan_id text not null,
  plan_name text not null,
  customer_name text,
  customer_email text,
  customer_tax_id text,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null default 'pending',
  provider text not null default 'woovi',
  correlation_id text not null unique,
  provider_charge_id text,
  payment_link_url text,
  br_code text,
  qr_code_image text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_invoices_tenant_created
  on public.billing_invoices (tenant_id, created_at desc);

create index if not exists idx_billing_invoices_status_created
  on public.billing_invoices (status, created_at desc);

alter table public.billing_invoices enable row level security;

comment on table public.billing_invoices is
  'F-Insight billing invoices. Backend secret-key access only; no public RLS policies.';

commit;
