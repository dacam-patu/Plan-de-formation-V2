-- ============================================================================
--  Plan de formation — V2  |  Base de données Supabase (PostgreSQL)
--  À exécuter dans Supabase :  SQL Editor  →  coller tout  →  RUN
--  Sécurité par "Row Level Security" (RLS) : chaque règle est appliquée
--  côté serveur, impossible à contourner depuis le navigateur.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1) PROFILS   (un profil par compte, relié à auth.users)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'prof' check (role in ('admin','prof')),
  created_at timestamptz default now()
);

-- Création automatique du profil à chaque inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 2) PLANS       (le plan complet est stocké en JSON dans "data")
-- ─────────────────────────────────────────────────────────────
create table if not exists public.plans (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'Plan de formation',
  data       jsonb not null default '{}'::jsonb,
  published  boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists plans_owner_idx     on public.plans(owner);
create index if not exists plans_published_idx on public.plans(published);

-- ─────────────────────────────────────────────────────────────
-- 3) DROITS D'ÉDITION  (qui a le droit de modifier tel plan)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.plan_editors (
  plan_id uuid not null references public.plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (plan_id, user_id)
);

-- ─────────────────────────────────────────────────────────────
-- Fonctions utilitaires (SECURITY DEFINER = évitent les récursions RLS)
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.can_view_plan(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
     or exists(select 1 from public.plans where id = p_id and (published or owner = auth.uid()))
     or exists(select 1 from public.plan_editors where plan_id = p_id and user_id = auth.uid());
$$;

create or replace function public.can_edit_plan(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
     or exists(select 1 from public.plans where id = p_id and owner = auth.uid())
     or exists(select 1 from public.plan_editors where plan_id = p_id and user_id = auth.uid());
$$;

create or replace function public.is_plan_owner(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
     or exists(select 1 from public.plans where id = p_id and owner = auth.uid());
$$;

-- ============================================================================
--  ACTIVATION DE LA SÉCURITÉ (RLS)
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.plans        enable row level security;
alter table public.plan_editors enable row level security;

-- ── PROFILS ──────────────────────────────────────────────────
drop policy if exists p_profiles_select on public.profiles;
create policy p_profiles_select on public.profiles
  for select to authenticated using (true);            -- lisibles par tous les connectés (choisir un éditeur)

drop policy if exists p_profiles_admin_update on public.profiles;
create policy p_profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());  -- seul l'admin change les rôles

-- ── PLANS ────────────────────────────────────────────────────
drop policy if exists p_plans_select on public.plans;
create policy p_plans_select on public.plans
  for select to authenticated using (public.can_view_plan(id));

drop policy if exists p_plans_insert on public.plans;
create policy p_plans_insert on public.plans
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists p_plans_update on public.plans;
create policy p_plans_update on public.plans
  for update to authenticated
  using (public.can_edit_plan(id)) with check (public.can_edit_plan(id));

drop policy if exists p_plans_delete on public.plans;
create policy p_plans_delete on public.plans
  for delete to authenticated
  using (public.is_plan_owner(id));

-- ── DROITS D'ÉDITION ─────────────────────────────────────────
drop policy if exists p_editors_select on public.plan_editors;
create policy p_editors_select on public.plan_editors
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid() or public.is_plan_owner(plan_id));

drop policy if exists p_editors_write on public.plan_editors;
create policy p_editors_write on public.plan_editors
  for all to authenticated
  using (public.is_plan_owner(plan_id)) with check (public.is_plan_owner(plan_id));

-- ============================================================================
--  APRÈS votre 1ʳᵉ inscription dans l'appli, devenez ADMIN :
--  (remplacez l'email par le vôtre, puis exécutez cette ligne)
-- ============================================================================
-- update public.profiles set role = 'admin' where email = 'dacamalon@gmail.com';
