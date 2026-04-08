alter table if exists project_budget_items
  add column if not exists progress numeric(7,2) not null default 0;

update project_budget_items
set progress = coalesce(progress, 0)
where progress is null;
