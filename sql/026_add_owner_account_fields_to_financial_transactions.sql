alter table financial_transactions
  alter column project_id drop not null;

alter table financial_transactions
  add column if not exists account_type text not null default 'project' check (account_type in ('project', 'owner')),
  add column if not exists income_origin text null,
  add column if not exists funding_source text null;

create index if not exists idx_financial_transactions_account_type
  on financial_transactions(account_type);

create index if not exists idx_financial_transactions_income_origin
  on financial_transactions(income_origin);
