alter table if exists project_budget_items
  add column if not exists unit text,
  add column if not exists quantity numeric(14, 4) not null default 0,
  add column if not exists material_cost numeric(14, 2) not null default 0,
  add column if not exists labor_cost numeric(14, 2) not null default 0,
  add column if not exists indirect_cost numeric(14, 2) not null default 0,
  add column if not exists total_unit_price numeric(14, 2) not null default 0,
  add column if not exists estimated_days numeric(14, 2) not null default 0,
  add column if not exists notes text,
  add column if not exists material_details text,
  add column if not exists indirect_factor numeric(8, 4) not null default 0.2,
  add column if not exists materials jsonb not null default '[]'::jsonb,
  add column if not exists labor jsonb not null default '[]'::jsonb,
  add column if not exists subtasks jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists projects
  add column if not exists budget_status text,
  add column if not exists budget_validation_message text,
  add column if not exists budget_validation_type text,
  add column if not exists budget_validated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update project_budget_items
set
  materials = coalesce(materials, '[]'::jsonb),
  labor = coalesce(labor, '[]'::jsonb),
  subtasks = coalesce(subtasks, '[]'::jsonb),
  indirect_factor = coalesce(indirect_factor, 0.2),
  updated_at = coalesce(updated_at, now());