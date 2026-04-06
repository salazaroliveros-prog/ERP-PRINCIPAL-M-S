create extension if not exists pgcrypto;

create table if not exists inventory_items (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  unit text,
  stock numeric(14, 4) not null default 0,
  min_stock numeric(14, 4) not null default 0,
  unit_price numeric(14, 2) not null default 0,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists idx_inventory_items_project
  on inventory_items (project_id, name);

create table if not exists quotes (
  id text primary key default gen_random_uuid()::text,
  client_id text not null,
  project_id text not null references projects(id) on delete cascade,
  quote_date timestamptz not null default now(),
  status text not null default 'Pending',
  total numeric(14, 2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quotes_project
  on quotes (project_id, created_at desc);

create index if not exists idx_quotes_client
  on quotes (client_id, created_at desc);