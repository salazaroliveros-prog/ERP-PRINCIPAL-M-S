create extension if not exists pgcrypto;

alter table projects
  alter column id set default gen_random_uuid()::text;

alter table project_budget_items
  alter column id set default gen_random_uuid()::text;
