alter table if exists quotes
  add column if not exists notes text,
  add column if not exists sent_at timestamptz;

create index if not exists idx_quotes_status on quotes(status);
create index if not exists idx_quotes_sent_at on quotes(sent_at desc nulls last);
