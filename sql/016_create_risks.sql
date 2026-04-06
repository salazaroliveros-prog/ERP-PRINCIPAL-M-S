create table if not exists risks (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'Technical',
  impact text not null default 'Medium',
  probability text not null default 'Medium',
  status text not null default 'Identified',
  mitigation_plan text not null default '',
  contingency_plan text not null default '',
  owner text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_risks_project_id on risks(project_id);
create index if not exists idx_risks_status on risks(status);
create index if not exists idx_risks_impact on risks(impact);
create index if not exists idx_risks_created_at on risks(created_at desc);