create table if not exists project_pois (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  comment text not null default '',
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_pois_project_id
  on project_pois(project_id, created_at desc);

create table if not exists project_logbook_entries (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  project_id text not null references projects(id) on delete cascade,
  entry_date date not null,
  content text not null,
  weather text not null default 'Soleado',
  workers_count integer not null default 0,
  photos jsonb not null default '[]'::jsonb,
  author_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_logbook_entries_project_date
  on project_logbook_entries(project_id, entry_date desc, created_at desc);