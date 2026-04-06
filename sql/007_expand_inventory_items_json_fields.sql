alter table if exists inventory_items
  add column if not exists suppliers jsonb not null default '[]'::jsonb,
  add column if not exists batches jsonb not null default '[]'::jsonb;

update inventory_items
set
  suppliers = coalesce(suppliers, '[]'::jsonb),
  batches = coalesce(batches, '[]'::jsonb),
  updated_at = coalesce(updated_at, now());