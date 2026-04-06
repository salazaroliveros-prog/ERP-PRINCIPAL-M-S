create table if not exists notifications (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  title text not null,
  body text not null,
  type text not null default 'project',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_created_at
  on notifications(created_at desc);

create index if not exists idx_notifications_read_created
  on notifications(read, created_at desc);