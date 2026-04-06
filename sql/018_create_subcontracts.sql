alter table financial_transactions
  add column if not exists subcontract_id text;

create index if not exists idx_financial_transactions_subcontract_id
  on financial_transactions(subcontract_id);

create table if not exists subcontracts (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  project_id text not null references projects(id) on delete cascade,
  budget_item_id text,
  budget_item_name text not null default '',
  contractor text not null,
  service text not null,
  start_date date,
  end_date date,
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_subcontracts_project_service
  on subcontracts(project_id, lower(trim(service)));

create index if not exists idx_subcontracts_project_id
  on subcontracts(project_id);

create index if not exists idx_subcontracts_status
  on subcontracts(status);

create index if not exists idx_subcontracts_end_date
  on subcontracts(end_date);