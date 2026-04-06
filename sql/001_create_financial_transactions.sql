create extension if not exists pgcrypto;

create table if not exists financial_transactions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  budget_item_id text null,
  type text not null check (type in ('Income', 'Expense')),
  category text not null,
  amount numeric(14, 2) not null check (amount > 0),
  date date not null,
  description text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_transactions_date
  on financial_transactions (date desc, created_at desc);

create index if not exists idx_financial_transactions_project_id
  on financial_transactions (project_id);
