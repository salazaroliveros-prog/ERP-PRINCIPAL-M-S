create table if not exists equipment (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  type text not null default 'Owned',
  project_id text,
  daily_rate numeric(14,2) not null default 0,
  estimated_days numeric(14,2) not null default 0,
  status text not null default 'Available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_equipment_name on equipment(name);
create index if not exists idx_equipment_project_id on equipment(project_id);
create index if not exists idx_equipment_status on equipment(status);
