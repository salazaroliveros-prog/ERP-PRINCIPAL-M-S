create table if not exists inventory_transactions (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  material_id text not null,
  material_name text not null,
  type text not null,
  quantity numeric(14,2) not null default 0,
  batch_number text,
  previous_stock numeric(14,2),
  new_stock numeric(14,2),
  reason text,
  project_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_transactions_material_id on inventory_transactions(material_id);
create index if not exists idx_inventory_transactions_created_at on inventory_transactions(created_at desc);

create table if not exists deleted_records (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  type text not null,
  original_id text,
  material_id text,
  material_name text,
  batch_id text,
  data jsonb not null default '[]'::jsonb,
  reason text,
  deleted_at timestamptz not null default now()
);

create index if not exists idx_deleted_records_deleted_at on deleted_records(deleted_at desc);

create table if not exists purchase_orders (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  project_id text,
  budget_item_id text,
  material_id text,
  material_name text not null,
  quantity numeric(14,2) not null default 0,
  unit text,
  estimated_cost numeric(14,2) not null default 0,
  supplier text,
  notes text,
  status text not null default 'Pending',
  order_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_orders_material_id on purchase_orders(material_id);
create index if not exists idx_purchase_orders_project_id on purchase_orders(project_id);
