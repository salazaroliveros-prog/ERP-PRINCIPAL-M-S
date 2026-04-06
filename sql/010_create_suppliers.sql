create table if not exists suppliers (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  category text,
  contact text,
  email text,
  phone text,
  rating numeric(3,1) not null default 5.0,
  status text not null default 'Verified',
  balance numeric(14,2) not null default 0,
  last_order text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suppliers_name on suppliers(name);
create index if not exists idx_suppliers_category on suppliers(category);
create index if not exists idx_suppliers_status on suppliers(status);
