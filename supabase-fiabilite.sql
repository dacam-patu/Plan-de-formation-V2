-- ============================================================================
--  Plan de formation — complément « fiabilité »
--  À exécuter dans Supabase : SQL Editor → coller → RUN  (une seule fois,
--  en plus de supabase-setup.sql et supabase-logo.sql)
--
--  Objet : faire vivre la colonne plans.updated_at.
--  L'application s'en sert comme numéro de version : au moment d'enregistrer,
--  elle exige que la ligne porte encore l'updated_at qu'elle a lu au
--  chargement. Si un collègue a enregistré entre-temps, la mise à jour ne
--  touche aucune ligne et l'appli propose un arbitrage au lieu d'écraser
--  silencieusement le travail de l'autre.
--
--  Sans ce fichier l'application fonctionne quand même, mais updated_at ne
--  change jamais : la détection des écrasements est alors inopérante.
-- ============================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
  before update on public.plans
  for each row execute function public.touch_updated_at();

-- Les lignes déjà présentes peuvent avoir un updated_at nul : on le renseigne.
update public.plans set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.plans alter column updated_at set not null;
alter table public.plans alter column updated_at set default now();
