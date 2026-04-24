create table if not exists tasks (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  title text not null,
  description text,
  status text not null default 'pending',
  priority text not null default 'medium',
  project_id text references projects(id) on delete set null,
  assignee_id text,
  assignee_name text,
  due_date date,
  completed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_assignee_id on tasks(assignee_id);
create index if not exists idx_tasks_due_date on tasks(due_date);
