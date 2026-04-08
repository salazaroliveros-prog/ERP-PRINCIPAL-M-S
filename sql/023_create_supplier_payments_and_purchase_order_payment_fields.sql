create table if not exists supplier_payments (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  supplier_id text not null,
  purchase_order_id text,
  amount numeric(14,2) not null,
  payment_method text not null,
  payment_reference text,
  notes text,
  paid_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_payments_supplier_id on supplier_payments(supplier_id);
create index if not exists idx_supplier_payments_purchase_order_id on supplier_payments(purchase_order_id);
create index if not exists idx_supplier_payments_paid_at on supplier_payments(paid_at desc);

alter table if exists purchase_orders
  add column if not exists date_paid date,
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists stock_applied boolean not null default false,
  add column if not exists budget_applied boolean not null default false;

-- Existing orders already consumed requirement stock in historical logic.
update purchase_orders
set stock_applied = true
where stock_applied = false;

-- Existing completed orders already affected budget in historical logic.
update purchase_orders
set budget_applied = true
where budget_applied = false
  and status in ('Completed', 'Paid');
