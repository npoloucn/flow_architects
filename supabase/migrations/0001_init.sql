-- FlowArquitecture - migracion inicial (Supabase / Postgres 15+)
-- Proyecto: fzlocerxiyneblglpoat
-- Idempotente: se puede ejecutar varias veces en el SQL Editor sin romper nada.
-- Requiere los roles de Supabase (anon, authenticated).
--
-- Orden: tablas -> indices -> triggers -> helpers (security definer) -> RPC -> RLS -> grants.
-- Los helpers son SECURITY DEFINER y corren como su owner, por eso pueden leer
-- projects/project_members ignorando RLS y no producen recursion de politicas.
-- No se usa "force row level security": los helpers dependen de que el owner
-- siga teniendo el bypass implicito de RLS.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) <= 120)
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  description text not null default '',
  data        jsonb not null default '{}'::jsonb,
  revision    integer not null default 1,
  visibility  text not null default 'privado',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint projects_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint projects_revision_positive check (revision >= 1),
  constraint projects_visibility_check check (visibility in ('privado', 'enlace', 'publico'))
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  constraint project_members_role_check check (role in ('viewer', 'editor'))
);

create table if not exists public.project_revisions (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  revision   integer not null,
  data       jsonb not null,
  author_id  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_revisions_project_revision_key unique (project_id, revision)
);

-- ---------------------------------------------------------------------------
-- 2. Indices (los de RLS son obligatorios para que las politicas no escaneen)
-- ---------------------------------------------------------------------------

create index if not exists projects_owner_id_idx
  on public.projects (owner_id);

create index if not exists projects_visibility_idx
  on public.projects (visibility)
  where deleted_at is null;

create index if not exists project_members_user_id_idx
  on public.project_members (user_id);

create index if not exists project_revisions_project_revision_idx
  on public.project_revisions (project_id, revision desc);

-- ---------------------------------------------------------------------------
-- 3. Triggers de updated_at y alta de perfil
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row
  execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');

  if v_name is null then
    v_name := nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), '');
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(v_name, ''), 120))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Helpers security definer (evitan recursion: leen las tablas como owner)
-- ---------------------------------------------------------------------------

create or replace function public.is_project_owner(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project
      and p.owner_id = (select auth.uid())
  );
$$;

-- Sirve para authenticated y anon (anon solo alcanza visibilidad enlace/publico).
create or replace function public.can_read_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project
      and p.deleted_at is null
      and (
        p.owner_id = (select auth.uid())
        or p.visibility in ('enlace', 'publico')
        or exists (
          select 1
          from public.project_members m
          where m.project_id = p.id
            and m.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.can_edit_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project
      and p.deleted_at is null
      and (
        p.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.project_members m
          where m.project_id = p.id
            and m.user_id = (select auth.uid())
            and m.role = 'editor'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC de escritura
-- ---------------------------------------------------------------------------

-- Guarda data con control optimista de revision. Deja snapshot de la revision
-- anterior en project_revisions antes de incrementar.
create or replace function public.save_project(
  p_project uuid,
  p_data jsonb,
  p_expected_revision integer default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.projects;
begin
  if v_uid is null then
    raise exception 'Sesion requerida' using errcode = '28000';
  end if;

  if p_data is null then
    raise exception 'p_data no puede ser null' using errcode = '22004';
  end if;

  if not public.can_edit_project(p_project) then
    raise exception 'Sin permiso para editar el proyecto' using errcode = '42501';
  end if;

  select p.*
    into v_row
    from public.projects p
   where p.id = p_project
     and p.deleted_at is null
   for update;

  if not found then
    raise exception 'Proyecto no encontrado' using errcode = 'P0002';
  end if;

  if p_expected_revision is not null and v_row.revision <> p_expected_revision then
    raise exception 'Conflicto de revision: esperada %, actual %',
      p_expected_revision, v_row.revision
      using errcode = '40001';
  end if;

  insert into public.project_revisions (project_id, revision, data, author_id)
  values (v_row.id, v_row.revision, v_row.data, v_uid);

  update public.projects
     set data = p_data,
         revision = v_row.revision + 1,
         updated_at = now()
   where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- Solo el duenio agrega/actualiza miembros. Busca el usuario por correo.
create or replace function public.add_project_member(
  p_project uuid,
  p_email text,
  p_role text default 'viewer'
)
returns public.project_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_user_id uuid;
  v_row public.project_members;
begin
  if v_uid is null then
    raise exception 'Sesion requerida' using errcode = '28000';
  end if;

  if not public.is_project_owner(p_project) then
    raise exception 'Solo el duenio puede administrar miembros' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('viewer', 'editor') then
    raise exception 'Rol invalido: %', p_role using errcode = '22023';
  end if;

  select u.id
    into v_user_id
    from auth.users u
   where lower(u.email) = lower(btrim(coalesce(p_email, '')))
   limit 1;

  if v_user_id is null then
    raise exception 'Usuario no encontrado para el correo indicado' using errcode = 'P0002';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (p_project, v_user_id, p_role)
  on conflict (project_id, user_id) do update
    set role = excluded.role
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_revisions enable row level security;

-- profiles: lectura para autenticados, update solo del propio perfil.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- projects: lectura via helper, alta solo propio owner, update/delete solo owner.
drop policy if exists projects_select_readable on public.projects;
create policy projects_select_readable
  on public.projects
  for select
  to anon, authenticated
  using ((select public.can_read_project(id)));

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own
  on public.projects
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists projects_update_owner on public.projects;
create policy projects_update_owner
  on public.projects
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists projects_delete_owner on public.projects;
create policy projects_delete_owner
  on public.projects
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- project_members: el miembro ve su fila, el owner lo ve todo y administra.
-- La comprobacion de owner pasa por el helper, nunca por un subselect a la
-- propia tabla (eso causaria recursion infinita en RLS).
drop policy if exists project_members_select_member_or_owner on public.project_members;
create policy project_members_select_member_or_owner
  on public.project_members
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (select public.is_project_owner(project_id))
  );

drop policy if exists project_members_manage_owner on public.project_members;
create policy project_members_manage_owner
  on public.project_members
  for all
  to authenticated
  using ((select public.is_project_owner(project_id)))
  with check ((select public.is_project_owner(project_id)));

-- project_revisions: lectura via helper. Sin politicas de escritura:
-- solo se insertan desde save_project (security definer).
drop policy if exists project_revisions_select_readable on public.project_revisions;
create policy project_revisions_select_readable
  on public.project_revisions
  for select
  to anon, authenticated
  using ((select public.can_read_project(project_id)));

-- ---------------------------------------------------------------------------
-- 7. Grants / revokes
-- ---------------------------------------------------------------------------

-- Funciones de trigger: no deben ser invocables desde la API.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Helpers usados dentro de politicas: requieren EXECUTE del rol que consulta.
revoke all on function public.is_project_owner(uuid) from public, anon;
grant execute on function public.is_project_owner(uuid) to authenticated;

revoke all on function public.can_read_project(uuid) from public;
grant execute on function public.can_read_project(uuid) to anon, authenticated;

revoke all on function public.can_edit_project(uuid) from public, anon;
grant execute on function public.can_edit_project(uuid) to authenticated;

-- RPC de escritura: solo usuarios autenticados.
revoke all on function public.save_project(uuid, jsonb, integer) from public, anon;
grant execute on function public.save_project(uuid, jsonb, integer) to authenticated;

revoke all on function public.add_project_member(uuid, text, text) from public, anon;
grant execute on function public.add_project_member(uuid, text, text) to authenticated;

-- Endurecimiento: nada de escritura directa que esquive el diseno.
revoke insert, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.project_revisions from anon, authenticated;
revoke truncate on public.profiles, public.projects, public.project_members, public.project_revisions
  from anon, authenticated;

commit;
