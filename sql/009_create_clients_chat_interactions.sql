create table if not exists clients (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  email text,
  phone text,
  company text,
  contact_person text,
  contacto text,
  status text not null default 'Lead',
  notes text,
  location jsonb,
  attachments jsonb not null default '[]'::jsonb,
  last_interaction timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_name on clients(name);
create index if not exists idx_clients_status on clients(status);
create index if not exists idx_clients_last_interaction on clients(last_interaction desc nulls last);

create table if not exists client_chats (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  client_id text not null references clients(id) on delete cascade,
  text text not null,
  sender text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_chats_client_created_at on client_chats(client_id, created_at asc);

create table if not exists client_interactions (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  client_id text not null references clients(id) on delete cascade,
  type text not null,
  notes text not null,
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_interactions_client_date on client_interactions(client_id, date desc, created_at desc);
