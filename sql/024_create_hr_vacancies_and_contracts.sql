alter table documents
  add column if not exists file_url text;

create table if not exists vacancies (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  title text not null,
  department text not null default 'Operaciones',
  openings integer not null default 1,
  status text not null default 'Open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vacancies_status on vacancies(status);
create index if not exists idx_vacancies_created_at on vacancies(created_at desc);

create table if not exists employment_contracts (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  employee_id text not null references employees(id) on delete cascade,
  employee_name text not null,
  employee_role text not null,
  employee_department text not null,
  salary numeric(12,2) not null default 0,
  start_date date not null,
  contract_type text not null default 'Tiempo indefinido',
  company_name text not null,
  owner_name text not null,
  owner_title text not null,
  status text not null default 'draft',
  share_token text not null unique,
  sent_at timestamptz,
  worker_signed_at timestamptz,
  owner_signed_at timestamptz,
  worker_signature_data_url text,
  owner_signature_data_url text,
  signed_file_url text,
  signed_file_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employment_contracts_employee_id on employment_contracts(employee_id);
create index if not exists idx_employment_contracts_status on employment_contracts(status);
create index if not exists idx_employment_contracts_created_at on employment_contracts(created_at desc);
