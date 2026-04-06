alter table projects add column if not exists location text;
alter table projects add column if not exists project_manager text;
alter table projects add column if not exists physical_progress numeric(7,2) not null default 0;
alter table projects add column if not exists financial_progress numeric(7,2) not null default 0;
alter table projects add column if not exists start_date date;
alter table projects add column if not exists end_date date;
alter table projects add column if not exists client_uid text;
alter table projects add column if not exists typology text not null default 'RESIDENCIAL';
alter table projects add column if not exists latitude numeric(10,7);
alter table projects add column if not exists longitude numeric(10,7);

update projects
set location = coalesce(location, 'Ubicacion pendiente')
where location is null;

alter table projects alter column location set not null;
