create table if not exists employees (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  role text not null,
  department text not null default 'Operaciones',
  salary numeric(14,2) not null default 0,
  status text not null default 'Active',
  join_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists attendance (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  employee_id text not null references employees(id) on delete cascade,
  employee_name text,
  type text not null,
  timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_employees_name on employees(name);
create index if not exists idx_employees_department on employees(department);
create index if not exists idx_employees_status on employees(status);
create index if not exists idx_attendance_employee_timestamp on attendance(employee_id, timestamp desc);
