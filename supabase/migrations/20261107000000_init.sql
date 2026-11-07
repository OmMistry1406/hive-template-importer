-- Provenance: what was uploaded, row by row, kept verbatim and never edited.
create table import_runs (
  id           uuid primary key default gen_random_uuid(),
  file_name    text not null,
  file_sha256  text not null,
  file_bytes   integer not null,
  headers      jsonb not null,
  row_count    integer not null,
  stats        jsonb not null,
  verification jsonb not null,
  created_at   timestamptz not null default now()
);

create table import_source_rows (
  id            uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs (id) on delete cascade,
  row_number    integer not null,
  cells         jsonb not null,
  disposition   text not null
    check (disposition in ('mapped', 'structure_only', 'quarantined', 'blank')),
  unique (import_run_id, row_number)
);

create table import_issues (
  id            uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs (id) on delete cascade,
  row_number    integer,
  severity      text not null check (severity in ('info', 'warning', 'error')),
  origin        text not null check (origin in ('export_gap', 'importer_limit', 'source_data')),
  code          text not null,
  message       text not null,
  detail        text
);
create index import_issues_run_idx on import_issues (import_run_id, row_number);

-- Working copy: the structured template people edit.
create table templates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  import_run_id  uuid references import_runs (id) on delete set null,
  copied_from_id uuid references templates (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table sections (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references templates (id) on delete cascade,
  position      integer not null,
  name          text not null,
  imported_name text,
  unique (template_id, position)
);

create table items (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references sections (id) on delete cascade,
  position      integer not null,
  name          text not null,
  imported_name text,
  unique (section_id, position)
);

-- comment_type, category, answer_type stay free text: an unexpected value in a
-- customer's export must be kept and flagged, not rejected by a constraint.
create table comments (
  id                 uuid primary key default gen_random_uuid(),
  item_id            uuid not null references items (id) on delete cascade,
  position           integer not null,
  name               text not null,
  text_html          text,
  comment_type       text,
  category           text,
  recommendation     text,
  answer_type        text,
  choice_options     jsonb not null default '[]',
  unit_options       jsonb not null default '[]',
  attributes         jsonb not null default '{}',
  source_row_id      uuid references import_source_rows (id) on delete set null,
  imported_name      text,
  imported_text_html text,
  unique (item_id, position)
);
create index comments_source_row_idx on comments (source_row_id);

-- A single statement, so a failed copy leaves nothing behind.
create function copy_template(p_source uuid, p_name text)
returns uuid
language plpgsql
as $$
declare
  v_new uuid := gen_random_uuid();
begin
  insert into templates (id, name, import_run_id, copied_from_id)
  select v_new, p_name, import_run_id, id from templates where id = p_source;

  if not found then
    raise exception 'template % not found', p_source using errcode = 'P0002';
  end if;

  with section_map as materialized (
    select id as old_id, gen_random_uuid() as new_id, position, name, imported_name
    from sections where template_id = p_source
  ),
  section_insert as (
    insert into sections (id, template_id, position, name, imported_name)
    select new_id, v_new, position, name, imported_name from section_map
  ),
  item_map as materialized (
    select i.id as old_id, gen_random_uuid() as new_id, s.new_id as section_id,
           i.position, i.name, i.imported_name
    from items i join section_map s on s.old_id = i.section_id
  ),
  item_insert as (
    insert into items (id, section_id, position, name, imported_name)
    select new_id, section_id, position, name, imported_name from item_map
  )
  insert into comments (
    item_id, position, name, text_html, comment_type, category, recommendation,
    answer_type, choice_options, unit_options, attributes, source_row_id,
    imported_name, imported_text_html
  )
  select m.new_id, c.position, c.name, c.text_html, c.comment_type, c.category,
         c.recommendation, c.answer_type, c.choice_options, c.unit_options,
         c.attributes, c.source_row_id, c.imported_name, c.imported_text_html
  from comments c join item_map m on m.old_id = c.item_id;

  return v_new;
end;
$$;

-- The app connects server-side as the database owner. Supabase's public REST
-- API must see nothing, so RLS is on with no policies.
alter table import_runs enable row level security;
alter table import_source_rows enable row level security;
alter table import_issues enable row level security;
alter table templates enable row level security;
alter table sections enable row level security;
alter table items enable row level security;
alter table comments enable row level security;

-- Supabase grants new functions to its API roles directly, so revoking from
-- public alone is not enough. These roles do not exist on plain Postgres.
revoke execute on function copy_template(uuid, text) from public;
do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke execute on function copy_template(uuid, text) from %I', api_role);
    end if;
  end loop;
end;
$$;
