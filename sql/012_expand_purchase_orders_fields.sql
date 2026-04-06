alter table if exists purchase_orders
  add column if not exists supplier_id text,
  add column if not exists date_received date,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_purchase_orders_status on purchase_orders(status);
create index if not exists idx_purchase_orders_supplier_id on purchase_orders(supplier_id);
