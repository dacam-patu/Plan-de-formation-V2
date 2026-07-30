-- ============================================================================
--  Complément : réglages de l'application (logo partagé)
--  À exécuter dans Supabase : SQL Editor → coller → RUN
--  (à faire UNE fois, en plus de supabase-setup.sql)
-- ============================================================================

create table if not exists public.app_settings (
  id         int primary key default 1,
  logo       text,                       -- image encodée (data URI)
  updated_at timestamptz default now(),
  constraint app_settings_single_row check (id = 1)
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Lecture PUBLIQUE (même non connecté) : nécessaire pour afficher le logo sur
-- l'écran de connexion, avant que l'utilisateur ne soit authentifié.
drop policy if exists p_settings_read on public.app_settings;
create policy p_settings_read on public.app_settings
  for select to anon, authenticated using (true);

-- Écriture réservée aux administrateurs.
drop policy if exists p_settings_write on public.app_settings;
create policy p_settings_write on public.app_settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
