create table if not exists document_folders (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  type text not null,
  size text,
  folder text not null,
  author text,
  date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_documents_folder on documents(folder);
create index if not exists idx_documents_created_at on documents(created_at desc);

insert into document_folders (name, color)
values
  ('Planos', 'text-blue-500'),
  ('Finanzas', 'text-emerald-500'),
  ('Legal', 'text-rose-500'),
  ('Diseño', 'text-purple-500'),
  ('General', 'text-slate-500')
on conflict (name) do nothing;
