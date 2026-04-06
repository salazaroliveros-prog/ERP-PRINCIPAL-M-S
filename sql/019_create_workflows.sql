create table if not exists workflows (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  title text not null,
  type text not null default 'other',
  reference_id text not null,
  status text not null default 'pending',
  requested_by text not null default '',
  requested_at timestamptz not null default now(),
  priority text not null default 'medium',
  description text not null default '',
  amount numeric(14,2),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflows_requested_at on workflows(requested_at desc);
create index if not exists idx_workflows_status on workflows(status);
create index if not exists idx_workflows_type on workflows(type);
create index if not exists idx_workflows_priority on workflows(priority);