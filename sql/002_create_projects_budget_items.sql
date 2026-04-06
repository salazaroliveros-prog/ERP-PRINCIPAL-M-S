create table if not exists projects (
  id text primary key,
  name text not null,
  area numeric(12, 2) not null default 0,
  status text not null default 'Planning',
  budget numeric(14, 2) not null default 0,
  spent numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists project_budget_items (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  description text not null,
  category text null,
  total_item_price numeric(14, 2) not null default 0,
  sort_order integer not null default 0
);

create index if not exists idx_projects_created_at
  on projects (created_at desc);

create index if not exists idx_project_budget_items_project
  on project_budget_items (project_id, sort_order);

-- Seed minimo para que Finanzas tenga datos de referencia iniciales.
insert into projects (id, name, area, status, budget, spent)
values ('default-project', 'Proyecto Inicial', 150, 'Planning', 0, 0)
on conflict (id) do nothing;

insert into project_budget_items (id, project_id, description, category, total_item_price, sort_order)
values
  ('default-item-01', 'default-project', 'Movimiento de tierra', 'Maquinaria y Equipo', 0, 1),
  ('default-item-02', 'default-project', 'Cimentacion', 'Materiales', 0, 2),
  ('default-item-03', 'default-project', 'Estructura', 'Mano de Obra', 0, 3)
on conflict (id) do nothing;
