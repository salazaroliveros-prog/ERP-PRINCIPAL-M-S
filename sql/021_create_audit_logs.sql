create table if not exists audit_logs (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  project_id text references projects(id) on delete set null,
  user_id text,
  user_name text not null default 'Usuario',
  user_email text,
  action text not null,
  module text not null,
  details text not null,
  type text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at
  on audit_logs(created_at desc);

create index if not exists idx_audit_logs_project_created
  on audit_logs(project_id, created_at desc);

create index if not exists idx_audit_logs_module_type
  on audit_logs(module, type, created_at desc);