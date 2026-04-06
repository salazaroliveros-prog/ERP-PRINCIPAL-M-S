create table if not exists safety_incidents (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  title text not null,
  type text not null default 'Accidente',
  severity text not null default 'Baja',
  location text not null default '',
  incident_date date not null default current_date,
  description text not null default '',
  measures text not null default '',
  status text not null default 'Open',
  author_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_safety_incidents_date on safety_incidents(incident_date desc);
create index if not exists idx_safety_incidents_status on safety_incidents(status);
create index if not exists idx_safety_incidents_severity on safety_incidents(severity);